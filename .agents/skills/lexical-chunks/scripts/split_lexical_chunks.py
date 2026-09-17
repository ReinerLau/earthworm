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

"""Split pasted English into deterministic, non-overlapping lexical chunks."""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
from typing import Any

import wn
from wn.morphy import Morphy

LEXICON = "oewn:2025"
SPACY_VERSION = "3.8.7"
MODEL_DISTRIBUTION = "en-core-web-sm"
MODEL_VERSION = "3.8.0"
DEFAULT_OUTPUT = Path("outputs/lexical-chunks/text.chunks.md")
DEFAULT_RULES = Path(__file__).resolve().parents[1] / "rules" / "second-pass-rules.json"
ANALYSIS_SCHEMA_VERSION = 1
ANNOTATION_SCHEMA_VERSION = 1
SENTENCE_PATTERN = re.compile(
    r".*?[.!?]+(?:[\"'’”’\)\]]+)?(?=\s|$)|.+$",
    re.DOTALL,
)
TOKEN_PATTERN = re.compile(
    r"[A-Za-z]+(?:[’'][A-Za-z]+)*(?:-[A-Za-z]+(?:[’'][A-Za-z]+)*)*"
    r"|\d+(?:,\d{3})*(?:\.\d+)?"
)
RULE_SCHEMA_VERSION = 1
KNOWN_RELATIONS = {"left_member_governs_right", "right_marks_left_xcomp"}
KNOWN_ACTIONS = {"merge"}
KNOWN_CONDITIONS = {"sources", "head_pos", "text", "pos", "dep"}


class ConfigurationError(RuntimeError):
    """Raised when a fixed runtime dependency or rule file is incompatible."""


@dataclass(frozen=True)
class Token:
    text: str
    start: int
    end: int


@dataclass(frozen=True)
class SyntaxToken:
    text: str
    start: int
    end: int
    pos: str
    dep: str
    head: int


@dataclass(frozen=True)
class Segment:
    start: int
    end: int
    source: str
    rule: str | None = None


@dataclass(frozen=True)
class Rule:
    name: str
    priority: int
    left: Mapping[str, tuple[str, ...]]
    right: Mapping[str, tuple[str, ...]]
    relation: str
    action: str


@dataclass
class TrieNode:
    children: dict[str, TrieNode] = field(default_factory=dict)
    terminal: bool = False


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Analyze English from stdin or render a validated contextual-meaning "
            "report."
        )
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--analysis-output",
        type=Path,
        help="write structured sentence and chunk analysis JSON to this path",
    )
    mode.add_argument(
        "--render-analysis",
        type=Path,
        help=(
            "load analysis JSON from this path and read contextual meanings JSON "
            "from stdin"
        ),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help=f"output Markdown path (default: {DEFAULT_OUTPUT})",
    )
    return parser.parse_args()


def split_sentences(text: str) -> list[str]:
    text = re.sub(r"\\\r?\n", "\n", text)
    normalized = re.sub(r"\s+", " ", text).strip()
    if not normalized:
        return []
    return [match.group(0).strip() for match in SENTENCE_PATTERN.finditer(normalized)]


def tokenize(sentence: str) -> list[Token]:
    return [
        Token(match.group(0), match.start(), match.end())
        for match in TOKEN_PATTERN.finditer(sentence)
    ]


def ensure_lexicon() -> wn.Wordnet:
    installed = any(
        lexicon.id == "oewn" and lexicon.version == "2025" for lexicon in wn.lexicons()
    )
    if not installed:
        wn.download(LEXICON)
    return wn.Wordnet(LEXICON)


def build_trie(forms: Iterable[str]) -> TrieNode:
    root = TrieNode()
    for form in forms:
        parts = tuple(normalize(part) for part in form.replace("_", " ").split())
        if not parts:
            continue
        node = root
        for part in parts:
            node = node.children.setdefault(part, TrieNode())
        node.terminal = True
    return root


def lexicon_forms(wordnet: wn.Wordnet) -> Iterable[str]:
    seen: set[str] = set()
    for word in wordnet.words():
        for form in word.forms():
            normalized = normalize(form)
            if normalized not in seen:
                seen.add(normalized)
                yield normalized


def token_variants(token: str, lemmatize: Callable) -> set[str]:
    normalized = normalize(token)
    variants = {normalized}
    for lemmas in lemmatize(normalized).values():
        variants.update(normalize(lemma) for lemma in lemmas)
    return variants


def normalize(form: str) -> str:
    return unicodedata.normalize("NFC", form).casefold()


def can_join(sentence: str, left: Token, right: Token) -> bool:
    return sentence[left.end : right.start].isspace()


def find_lexicon_spans(
    sentence: str,
    tokens: Sequence[Token],
    trie: TrieNode,
    lemmatize: Callable[[str], dict[str | None, set[str]]],
) -> list[tuple[int, int]]:
    variants = [token_variants(token.text, lemmatize) for token in tokens]
    matches: list[tuple[int, int]] = []

    for start in range(len(tokens)):
        active_nodes = [trie]
        for end in range(start, len(tokens)):
            if end > start and not can_join(sentence, tokens[end - 1], tokens[end]):
                break

            next_nodes: list[TrieNode] = []
            seen_nodes: set[int] = set()
            for node in active_nodes:
                for variant in variants[end]:
                    child = node.children.get(variant)
                    if child is not None and id(child) not in seen_nodes:
                        seen_nodes.add(id(child))
                        next_nodes.append(child)
            if not next_nodes:
                break

            if end > start and any(node.terminal for node in next_nodes):
                matches.append((start, end + 1))
            active_nodes = next_nodes

    return matches


def select_longest_spans(
    token_count: int, candidates: Iterable[tuple[int, int]]
) -> list[tuple[int, int]]:
    occupied = [False] * token_count
    selected: list[tuple[int, int]] = []
    for start, end in sorted(candidates, key=lambda span: (-(span[1] - span[0]), span)):
        if not any(occupied[start:end]):
            selected.append((start, end))
            occupied[start:end] = [True] * (end - start)
    return sorted(selected)


def initial_segments(
    token_count: int, lexicon_spans: Sequence[tuple[int, int]]
) -> list[Segment]:
    by_start = {start: end for start, end in lexicon_spans}
    segments: list[Segment] = []
    index = 0
    while index < token_count:
        end = by_start.get(index)
        if end is None:
            segments.append(Segment(index, index + 1, "token"))
            index += 1
        else:
            segments.append(Segment(index, end, "oewn"))
            index = end
    return segments


def _string_tuple(value: Any, location: str) -> tuple[str, ...]:
    if (
        not isinstance(value, list)
        or not value
        or not all(isinstance(x, str) for x in value)
    ):
        raise ConfigurationError(f"{location} must be a non-empty list of strings")
    return tuple(value)


def _parse_conditions(value: Any, location: str) -> Mapping[str, tuple[str, ...]]:
    if not isinstance(value, dict):
        raise ConfigurationError(f"{location} must be an object")
    unknown = set(value) - KNOWN_CONDITIONS
    if unknown:
        raise ConfigurationError(
            f"{location} has unknown conditions: {sorted(unknown)}"
        )
    return {
        key: _string_tuple(item, f"{location}.{key}") for key, item in value.items()
    }


def load_rules(path: Path = DEFAULT_RULES) -> list[Rule]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ConfigurationError(
            f"cannot load second-pass rules from {path}: {error}"
        ) from error

    if (
        not isinstance(payload, dict)
        or payload.get("schema_version") != RULE_SCHEMA_VERSION
    ):
        raise ConfigurationError(
            f"second-pass rules must use schema_version {RULE_SCHEMA_VERSION}"
        )
    raw_rules = payload.get("rules")
    if not isinstance(raw_rules, list) or not raw_rules:
        raise ConfigurationError(
            "second-pass rules must contain a non-empty rules list"
        )

    rules: list[Rule] = []
    names: set[str] = set()
    for index, raw in enumerate(raw_rules):
        location = f"rules[{index}]"
        if not isinstance(raw, dict):
            raise ConfigurationError(f"{location} must be an object")
        try:
            name = raw["name"]
            priority = raw["priority"]
            relation = raw["relation"]
            action = raw["action"]
        except KeyError as error:
            raise ConfigurationError(
                f"{location} is missing {error.args[0]}"
            ) from error
        if not isinstance(name, str) or not name:
            raise ConfigurationError(f"{location}.name must be a non-empty string")
        if name in names:
            raise ConfigurationError(f"duplicate rule name: {name}")
        if not isinstance(priority, int):
            raise ConfigurationError(f"{location}.priority must be an integer")
        if relation not in KNOWN_RELATIONS:
            raise ConfigurationError(f"{location}.relation is unsupported: {relation}")
        if action not in KNOWN_ACTIONS:
            raise ConfigurationError(f"{location}.action is unsupported: {action}")
        rules.append(
            Rule(
                name=name,
                priority=priority,
                left=_parse_conditions(raw.get("left", {}), f"{location}.left"),
                right=_parse_conditions(raw.get("right", {}), f"{location}.right"),
                relation=relation,
                action=action,
            )
        )
        names.add(name)
    return sorted(rules, key=lambda rule: (-rule.priority, rule.name))


def load_syntax_model() -> Any:
    try:
        spacy_version = version("spacy")
        model_version = version(MODEL_DISTRIBUTION)
    except PackageNotFoundError as error:
        raise ConfigurationError(
            f"required syntax dependency is missing: {error.name}"
        ) from error
    if spacy_version != SPACY_VERSION:
        raise ConfigurationError(
            f"spaCy {SPACY_VERSION} is required; found {spacy_version}"
        )
    if model_version != MODEL_VERSION:
        raise ConfigurationError(
            f"{MODEL_DISTRIBUTION} {MODEL_VERSION} is required; found {model_version}"
        )

    try:
        import en_core_web_sm

        return en_core_web_sm.load()
    except Exception as error:
        raise ConfigurationError(f"cannot load fixed syntax model: {error}") from error


def analyze_sentence(nlp: Any, sentence: str) -> list[SyntaxToken]:
    return [
        SyntaxToken(
            text=token.text,
            start=token.idx,
            end=token.idx + len(token.text),
            pos=token.pos_,
            dep=token.dep_,
            head=token.head.i,
        )
        for token in nlp(sentence)
    ]


def _syntax_indexes(
    segment: Segment, tokens: Sequence[Token], syntax: Sequence[SyntaxToken]
) -> tuple[int, ...]:
    start = tokens[segment.start].start
    end = tokens[segment.end - 1].end
    return tuple(
        index
        for index, item in enumerate(syntax)
        if item.start < end and item.end > start
    )


def _head_indexes(
    indexes: Sequence[int], syntax: Sequence[SyntaxToken]
) -> tuple[int, ...]:
    members = set(indexes)
    heads = tuple(
        index
        for index in indexes
        if syntax[index].head not in members or syntax[index].head == index
    )
    return heads or tuple(indexes)


def _matches_conditions(
    segment: Segment,
    conditions: Mapping[str, tuple[str, ...]],
    sentence: str,
    tokens: Sequence[Token],
    syntax: Sequence[SyntaxToken],
) -> bool:
    sources = conditions.get("sources")
    if sources is not None and segment.source not in sources:
        return False

    text_values = conditions.get("text")
    segment_text = sentence[tokens[segment.start].start : tokens[segment.end - 1].end]
    if text_values is not None and normalize(segment_text) not in {
        normalize(value) for value in text_values
    }:
        return False

    indexes = _syntax_indexes(segment, tokens, syntax)
    head_pos = conditions.get("head_pos")
    if head_pos is not None and not any(
        syntax[index].pos in head_pos for index in _head_indexes(indexes, syntax)
    ):
        return False

    token_conditions = {
        key: values for key, values in conditions.items() if key in {"pos", "dep"}
    }
    return not token_conditions or any(
        all(
            getattr(syntax[index], key) in values
            for key, values in token_conditions.items()
        )
        for index in indexes
    )


def _matches_relation(
    relation: str,
    left: Segment,
    right: Segment,
    tokens: Sequence[Token],
    syntax: Sequence[SyntaxToken],
) -> bool:
    left_indexes = set(_syntax_indexes(left, tokens, syntax))
    right_indexes = set(_syntax_indexes(right, tokens, syntax))
    if relation == "left_member_governs_right":
        return any(syntax[index].head in left_indexes for index in right_indexes)
    if relation == "right_marks_left_xcomp":
        return any(
            syntax[index].head < len(syntax)
            and syntax[syntax[index].head].dep == "xcomp"
            and syntax[syntax[index].head].head in left_indexes
            for index in right_indexes
        )
    raise AssertionError(f"validated relation is not implemented: {relation}")


def apply_second_pass(
    sentence: str,
    tokens: Sequence[Token],
    segments: Sequence[Segment],
    syntax: Sequence[SyntaxToken],
    rules: Sequence[Rule],
) -> list[Segment]:
    candidates: list[tuple[int, int, int, str]] = []
    for left_index in range(len(segments) - 1):
        left = segments[left_index]
        right = segments[left_index + 1]
        if not can_join(sentence, tokens[left.end - 1], tokens[right.start]):
            continue
        for rule in rules:
            if (
                _matches_conditions(left, rule.left, sentence, tokens, syntax)
                and _matches_conditions(right, rule.right, sentence, tokens, syntax)
                and _matches_relation(rule.relation, left, right, tokens, syntax)
            ):
                candidates.append((-rule.priority, left.start, left_index, rule.name))

    chosen: dict[int, str] = {}
    occupied: set[int] = set()
    for _, _, left_index, rule_name in sorted(candidates):
        right_index = left_index + 1
        if left_index not in occupied and right_index not in occupied:
            chosen[left_index] = rule_name
            occupied.update((left_index, right_index))

    result: list[Segment] = []
    index = 0
    while index < len(segments):
        rule_name = chosen.get(index)
        if rule_name is None:
            result.append(segments[index])
            index += 1
        else:
            result.append(
                Segment(
                    segments[index].start,
                    segments[index + 1].end,
                    "second-pass",
                    rule_name,
                )
            )
            index += 2
    return result


def find_sentence_chunks(
    sentence: str,
    trie: TrieNode,
    lemmatize: Callable[[str], dict[str | None, set[str]]],
    analyze: Callable[[str], Sequence[SyntaxToken]],
    rules: Sequence[Rule],
) -> list[str]:
    tokens = tokenize(sentence)
    if not tokens:
        return [sentence]
    candidates = find_lexicon_spans(sentence, tokens, trie, lemmatize)
    selected = select_longest_spans(len(tokens), candidates)
    segments = initial_segments(len(tokens), selected)
    segments = apply_second_pass(sentence, tokens, segments, analyze(sentence), rules)
    return [
        sentence[tokens[segment.start].start : tokens[segment.end - 1].end]
        for segment in segments
    ]


def find_chunks(
    sentence: str,
    trie: TrieNode,
    lemmatize: Callable[[str], dict[str | None, set[str]]],
    analyze: Callable[[str], Sequence[SyntaxToken]],
    rules: Sequence[Rule],
) -> list[str]:
    chunks = find_sentence_chunks(sentence, trie, lemmatize, analyze, rules)
    if chunks != [sentence]:
        chunks.append(sentence)
    return chunks


def build_analysis(
    sentences: Sequence[str],
    trie: TrieNode,
    lemmatize: Callable[[str], dict[str | None, set[str]]],
    analyze: Callable[[str], Sequence[SyntaxToken]],
    rules: Sequence[Rule],
) -> dict[str, Any]:
    return {
        "schema_version": ANALYSIS_SCHEMA_VERSION,
        "sentences": [
            {
                "sentence": sentence,
                "chunks": find_sentence_chunks(
                    sentence, trie, lemmatize, analyze, rules
                ),
            }
            for sentence in sentences
        ],
    }


def choose_output_path(requested: Path) -> Path:
    if not requested.exists():
        return requested

    index = 2
    while True:
        if requested.name.endswith(".chunks.md"):
            base = requested.name[: -len(".chunks.md")]
            name = f"{base}-{index}.chunks.md"
        else:
            name = f"{requested.stem}-{index}{requested.suffix}"
        candidate = requested.with_name(name)
        if not candidate.exists():
            return candidate
        index += 1


def markdown_escape(text: str) -> str:
    return text.replace("|", r"\|")


def markdown_content_escape(text: str) -> str:
    escaped = text.replace("\\", r"\\").replace("\n", "<br>")
    return re.sub(r"([`*_{}\[\]()<>#+\-.!|])", r"\\\1", escaped)


def render_report(chunks_by_sentence: Iterable[Iterable[str]]) -> str:
    lines = ["| 英文语块 |", "|---|"]
    for chunks in chunks_by_sentence:
        lines.extend(f"| {markdown_escape(chunk)} |" for chunk in chunks)
    return "\n".join(lines) + "\n"


def _require_exact_keys(
    value: Mapping[str, Any], expected: set[str], location: str
) -> None:
    actual = set(value)
    if actual == expected:
        return
    missing = sorted(expected - actual)
    unknown = sorted(actual - expected)
    details: list[str] = []
    if missing:
        details.append(f"missing keys {missing}")
    if unknown:
        details.append(f"unknown keys {unknown}")
    raise ConfigurationError(f"{location} has {' and '.join(details)}")


def validate_analysis(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ConfigurationError("analysis must be a JSON object")
    _require_exact_keys(payload, {"schema_version", "sentences"}, "analysis")
    if (
        not isinstance(payload["schema_version"], int)
        or isinstance(payload["schema_version"], bool)
        or payload["schema_version"] != ANALYSIS_SCHEMA_VERSION
    ):
        raise ConfigurationError(
            f"analysis must use schema_version {ANALYSIS_SCHEMA_VERSION}"
        )
    raw_sentences = payload["sentences"]
    if not isinstance(raw_sentences, list) or not raw_sentences:
        raise ConfigurationError("analysis.sentences must be a non-empty list")

    sentences: list[dict[str, Any]] = []
    for index, raw_sentence in enumerate(raw_sentences):
        location = f"analysis.sentences[{index}]"
        if not isinstance(raw_sentence, dict):
            raise ConfigurationError(f"{location} must be an object")
        _require_exact_keys(raw_sentence, {"sentence", "chunks"}, location)
        sentence = raw_sentence["sentence"]
        chunks = raw_sentence["chunks"]
        if not isinstance(sentence, str) or not sentence.strip():
            raise ConfigurationError(f"{location}.sentence must be a non-empty string")
        if (
            not isinstance(chunks, list)
            or not chunks
            or not all(isinstance(chunk, str) and chunk.strip() for chunk in chunks)
        ):
            raise ConfigurationError(
                f"{location}.chunks must be a non-empty list of non-empty strings"
            )
        sentences.append({"sentence": sentence, "chunks": list(chunks)})
    return {
        "schema_version": ANALYSIS_SCHEMA_VERSION,
        "sentences": sentences,
    }


def load_analysis(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.expanduser().read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ConfigurationError(
            f"cannot load analysis from {path}: {error}"
        ) from error
    return validate_analysis(payload)


def parse_annotations(text: str, analysis: Mapping[str, Any]) -> dict[str, Any]:
    try:
        payload = json.loads(text)
    except json.JSONDecodeError as error:
        raise ConfigurationError(f"annotations are not valid JSON: {error}") from error
    if not isinstance(payload, dict):
        raise ConfigurationError("annotations must be a JSON object")
    _require_exact_keys(payload, {"schema_version", "sentences"}, "annotations")
    if (
        not isinstance(payload["schema_version"], int)
        or isinstance(payload["schema_version"], bool)
        or payload["schema_version"] != ANNOTATION_SCHEMA_VERSION
    ):
        raise ConfigurationError(
            f"annotations must use schema_version {ANNOTATION_SCHEMA_VERSION}"
        )
    raw_sentences = payload["sentences"]
    analysis_sentences = analysis["sentences"]
    if not isinstance(raw_sentences, list):
        raise ConfigurationError("annotations.sentences must be a list")
    if len(raw_sentences) != len(analysis_sentences):
        raise ConfigurationError(
            "annotations.sentences must contain exactly "
            f"{len(analysis_sentences)} items; found {len(raw_sentences)}"
        )

    sentences: list[dict[str, Any]] = []
    for index, (raw_sentence, analyzed_sentence) in enumerate(
        zip(raw_sentences, analysis_sentences, strict=True)
    ):
        location = f"annotations.sentences[{index}]"
        if not isinstance(raw_sentence, dict):
            raise ConfigurationError(f"{location} must be an object")
        _require_exact_keys(
            raw_sentence,
            {"chunk_meanings", "sentence_translation"},
            location,
        )
        meanings = raw_sentence["chunk_meanings"]
        translation = raw_sentence["sentence_translation"]
        expected_count = len(analyzed_sentence["chunks"])
        if not isinstance(meanings, list):
            raise ConfigurationError(f"{location}.chunk_meanings must be a list")
        if len(meanings) != expected_count:
            raise ConfigurationError(
                f"{location}.chunk_meanings must contain exactly "
                f"{expected_count} items; found {len(meanings)}"
            )
        if not all(
            isinstance(meaning, str) and meaning.strip() for meaning in meanings
        ):
            raise ConfigurationError(
                f"{location}.chunk_meanings must contain only non-empty strings"
            )
        if not isinstance(translation, str) or not translation.strip():
            raise ConfigurationError(
                f"{location}.sentence_translation must be a non-empty string"
            )
        sentences.append(
            {
                "chunk_meanings": [meaning.strip() for meaning in meanings],
                "sentence_translation": translation.strip(),
            }
        )
    return {
        "schema_version": ANNOTATION_SCHEMA_VERSION,
        "sentences": sentences,
    }


def render_contextual_report(
    analysis: Mapping[str, Any], annotations: Mapping[str, Any]
) -> str:
    lines = ["# 教材语块释义", ""]
    for index, (analyzed_sentence, annotated_sentence) in enumerate(
        zip(analysis["sentences"], annotations["sentences"], strict=True), start=1
    ):
        lines.extend(
            [
                f"## 第 {index} 句",
                "",
                "| 英文语块 | 语境释义 |",
                "|---|---|",
            ]
        )
        lines.extend(
            "| "
            f"{markdown_content_escape(chunk)} | "
            f"{markdown_content_escape(meaning)} |"
            for chunk, meaning in zip(
                analyzed_sentence["chunks"],
                annotated_sentence["chunk_meanings"],
                strict=True,
            )
        )
        lines.extend(
            [
                "",
                "**完整原句：** "
                f"{markdown_content_escape(analyzed_sentence['sentence'])}",
                "",
                "**整句翻译：** "
                f"{markdown_content_escape(annotated_sentence['sentence_translation'])}",
                "",
            ]
        )
    return "\n".join(lines).rstrip() + "\n"


def write_output(requested: Path, content: str) -> Path:
    output = choose_output_path(requested.expanduser()).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(content, encoding="utf-8")
    return output


def main() -> int:
    args = parse_args()

    if args.render_analysis is not None:
        try:
            analysis = load_analysis(args.render_analysis)
            annotations = parse_annotations(sys.stdin.read(), analysis)
            report = render_contextual_report(analysis, annotations)
        except ConfigurationError as error:
            print(f"lexical-chunks: {error}", file=sys.stderr)
            return 1
        output = write_output(args.output, report)
        print(output)
        return 0

    text = sys.stdin.read()
    sentences = split_sentences(text)
    if not sentences or not any(tokenize(sentence) for sentence in sentences):
        print("No English text was provided on stdin.", file=sys.stderr)
        return 2

    try:
        rules = load_rules()
        nlp = load_syntax_model()
        wordnet = ensure_lexicon()
        trie = build_trie(lexicon_forms(wordnet))
        lemmatize = Morphy(wordnet)
        analysis = build_analysis(
            sentences,
            trie,
            lemmatize,
            lambda value: analyze_sentence(nlp, value),
            rules,
        )
    except ConfigurationError as error:
        print(f"lexical-chunks: {error}", file=sys.stderr)
        return 1

    if args.analysis_output is not None:
        output = write_output(
            args.analysis_output,
            json.dumps(analysis, ensure_ascii=False, indent=2) + "\n",
        )
    else:
        chunks_by_sentence: list[list[str]] = []
        for item in analysis["sentences"]:
            chunks = list(item["chunks"])
            if chunks != [item["sentence"]]:
                chunks.append(item["sentence"])
            chunks_by_sentence.append(chunks)
        output = write_output(args.output, render_report(chunks_by_sentence))
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
