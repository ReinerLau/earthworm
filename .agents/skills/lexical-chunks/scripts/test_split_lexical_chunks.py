#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10,<3.14"
# dependencies = [
#   "click==8.1.8",
#   "en-core-web-sm @ https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl",
#   "spacy==3.8.7",
#   "wn==1.1.1",
# ]
# ///

import json
import sys
from contextlib import redirect_stderr
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase, main as unittest_main
from unittest.mock import patch

from split_lexical_chunks import (
    ConfigurationError,
    analyze_sentence,
    build_analysis,
    build_trie,
    choose_output_path,
    find_chunks,
    load_rules,
    load_syntax_model,
    main as cli_main,
    parse_annotations,
    render_contextual_report,
    render_report,
    select_longest_spans,
    split_sentences,
    tokenize,
)


def fake_morphy(form: str):
    lemmas = {
        "dogs": {"dog"},
        "looked": {"look"},
        "babies": {"baby"},
        "took": {"take"},
    }
    return {None: lemmas.get(form, {form})}


class SplitLexicalChunksTests(TestCase):
    @classmethod
    def setUpClass(cls):
        cls.nlp = load_syntax_model()
        cls.rules = load_rules()

    def chunks(self, sentence: str, forms=()):
        return find_chunks(
            sentence,
            build_trie(forms),
            fake_morphy,
            lambda value: analyze_sentence(self.nlp, value),
            self.rules,
        )

    def analysis(self, sentence: str, forms=()):
        return build_analysis(
            [sentence],
            build_trie(forms),
            fake_morphy,
            lambda value: analyze_sentence(self.nlp, value),
            self.rules,
        )

    @staticmethod
    def sample_analysis():
        return {
            "schema_version": 1,
            "sentences": [
                {
                    "sentence": "Dogs bark.",
                    "chunks": ["Dogs", "bark"],
                }
            ],
        }

    @staticmethod
    def sample_annotations():
        return {
            "schema_version": 1,
            "sentences": [
                {
                    "chunk_meanings": ["狗", "吠叫"],
                    "sentence_translation": "狗会吠叫。",
                }
            ],
        }

    def test_keeps_unmatched_tokens_as_non_overlapping_segments(self):
        self.assertEqual(
            self.chunks("They listened."),
            ["They", "listened", "They listened."],
        )

    def test_does_not_duplicate_a_single_word_sentence(self):
        self.assertEqual(self.chunks("Hello"), ["Hello"])

    def test_splits_only_at_sentence_end_punctuation(self):
        self.assertEqual(
            split_sentences("Birdsong is calming, even in cities; listen. It helps!"),
            ["Birdsong is calming, even in cities; listen.", "It helps!"],
        )

    def test_empty_input_has_no_sentences(self):
        self.assertEqual(split_sentences(" \n\t"), [])

    def test_restores_markdown_escaped_line_breaks_before_splitting(self):
        self.assertEqual(
            split_sentences("First sentence.\\\n\\\nSecond sentence."),
            ["First sentence.", "Second sentence."],
        )

    def test_tokenizes_grouped_numbers_apostrophes_and_hyphens(self):
        self.assertEqual(
            [
                token.text
                for token in tokenize("1,500 don't damage nature's well-being.")
            ],
            ["1,500", "don't", "damage", "nature's", "well-being"],
        )

    def test_selects_longest_non_overlapping_oewn_matches(self):
        self.assertEqual(
            self.chunks(
                "Mental health care matters.",
                ["mental health", "health care", "mental health care"],
            ),
            ["Mental health care", "matters", "Mental health care matters."],
        )

    def test_combines_word_with_governed_preposition(self):
        self.assertEqual(
            self.chunks("Birdsong is good for our mental health.", ["mental health"]),
            [
                "Birdsong",
                "is",
                "good for",
                "our",
                "mental health",
                "Birdsong is good for our mental health.",
            ],
        )

    def test_extends_oewn_chunk_with_governed_preposition(self):
        self.assertEqual(
            self.chunks("Many people took part in the study.", ["take part"]),
            [
                "Many",
                "people",
                "took part in",
                "the",
                "study",
                "Many people took part in the study.",
            ],
        )

    def test_combines_verb_with_particle(self):
        self.assertEqual(
            self.chunks("Please look up the word."),
            ["Please", "look up", "the", "word", "Please look up the word."],
        )

    def test_combines_verb_with_infinitive_to(self):
        self.assertEqual(
            self.chunks("We need to investigate."),
            ["We", "need to", "investigate", "We need to investigate."],
        )

    def test_does_not_combine_across_punctuation(self):
        self.assertEqual(
            self.chunks("Noise, from traffic."),
            ["Noise", "from", "traffic", "Noise, from traffic."],
        )

    def test_requires_the_declared_dependency_relation(self):
        # The fixed model tags "birdsong" as ADP here, but not as a governed prep.
        self.assertEqual(
            self.chunks(
                "A study found that traffic noise reduces the benefits of hearing birdsong."
            ),
            [
                "A",
                "study",
                "found",
                "that",
                "traffic",
                "noise",
                "reduces",
                "the",
                "benefits of",
                "hearing",
                "birdsong",
                "A study found that traffic noise reduces the benefits of hearing birdsong.",
            ],
        )

    def test_builds_structured_analysis_without_sentence_in_chunks(self):
        self.assertEqual(
            self.analysis("Dogs bark."),
            {
                "schema_version": 1,
                "sentences": [
                    {
                        "sentence": "Dogs bark.",
                        "chunks": ["Dogs", "bark"],
                    }
                ],
            },
        )

    def test_longest_span_selection_breaks_ties_by_position(self):
        self.assertEqual(
            select_longest_spans(4, [(1, 3), (0, 2), (2, 4)]),
            [(0, 2), (2, 4)],
        )

    def test_renders_a_single_english_column(self):
        self.assertEqual(
            render_report([["dogs", "Dogs bark."]]),
            "| 英文语块 |\n|---|\n| dogs |\n| Dogs bark. |\n",
        )

    def test_escapes_markdown_table_pipes(self):
        self.assertEqual(
            render_report([["a | b"]]),
            "| 英文语块 |\n|---|\n| a \\| b |\n",
        )

    def test_parses_complete_contextual_annotations(self):
        annotations = self.sample_annotations()

        self.assertEqual(
            parse_annotations(json.dumps(annotations), self.sample_analysis()),
            annotations,
        )

    def test_rejects_invalid_annotation_json(self):
        with self.assertRaisesRegex(ConfigurationError, "not valid JSON"):
            parse_annotations("{", self.sample_analysis())

    def test_rejects_missing_or_extra_sentence_annotations(self):
        for sentences in ([], self.sample_annotations()["sentences"] * 2):
            with self.subTest(count=len(sentences)):
                payload = {"schema_version": 1, "sentences": sentences}
                with self.assertRaisesRegex(ConfigurationError, "exactly 1 items"):
                    parse_annotations(json.dumps(payload), self.sample_analysis())

    def test_rejects_wrong_chunk_meaning_count(self):
        payload = self.sample_annotations()
        payload["sentences"][0]["chunk_meanings"] = ["狗"]

        with self.assertRaisesRegex(ConfigurationError, "exactly 2 items"):
            parse_annotations(json.dumps(payload), self.sample_analysis())

    def test_rejects_empty_meaning_or_translation(self):
        for field, value in (
            ("chunk_meanings", ["狗", " "]),
            ("sentence_translation", " "),
        ):
            with self.subTest(field=field):
                payload = self.sample_annotations()
                payload["sentences"][0][field] = value
                with self.assertRaisesRegex(ConfigurationError, "non-empty"):
                    parse_annotations(json.dumps(payload), self.sample_analysis())

    def test_rejects_unknown_annotation_fields(self):
        payload = self.sample_annotations()
        payload["sentences"][0]["english"] = "Dogs bark."

        with self.assertRaisesRegex(ConfigurationError, "unknown keys"):
            parse_annotations(json.dumps(payload), self.sample_analysis())

    def test_renders_contextual_report_grouped_by_sentence(self):
        analysis = {
            "schema_version": 1,
            "sentences": [
                {"sentence": "A | B.", "chunks": ["A | B"]},
            ],
        }
        annotations = {
            "schema_version": 1,
            "sentences": [
                {
                    "chunk_meanings": ["甲 | 乙"],
                    "sentence_translation": "甲 | 乙。",
                }
            ],
        }

        self.assertEqual(
            render_contextual_report(analysis, annotations),
            "# 教材语块释义\n\n"
            "## 第 1 句\n\n"
            "| 英文语块 | 语境释义 |\n"
            "|---|---|\n"
            "| A \\| B | 甲 \\| 乙 |\n\n"
            "**完整原句：** A \\| B\\.\n\n"
            "**整句翻译：** 甲 \\| 乙。\n",
        )

    def test_render_validation_failure_does_not_create_report(self):
        with TemporaryDirectory() as directory:
            analysis_path = Path(directory) / "analysis.json"
            output_path = Path(directory) / "report.chunks.md"
            analysis_path.write_text(
                json.dumps(self.sample_analysis()), encoding="utf-8"
            )
            stderr = StringIO()
            with (
                patch.object(
                    sys,
                    "argv",
                    [
                        "split_lexical_chunks.py",
                        "--render-analysis",
                        str(analysis_path),
                        "--output",
                        str(output_path),
                    ],
                ),
                patch.object(sys, "stdin", StringIO("{")),
                redirect_stderr(stderr),
            ):
                status = cli_main()

            self.assertEqual(status, 1)
            self.assertIn("not valid JSON", stderr.getvalue())
            self.assertFalse(output_path.exists())

    def test_increments_name_before_chunks_suffix(self):
        with TemporaryDirectory() as directory:
            requested = Path(directory) / "text.chunks.md"
            requested.touch()
            (Path(directory) / "text-2.chunks.md").touch()

            self.assertEqual(
                choose_output_path(requested).name,
                "text-3.chunks.md",
            )


if __name__ == "__main__":
    unittest_main()
