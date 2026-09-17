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

"""Build deterministic progressive units from lexical content cores."""

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
DEFAULT_OUTPUT = Path("outputs/lexical-chunks/text.learning-units.md")
DEFAULT_RULES = Path(__file__).resolve().parents[1] / "rules" / "progression-rules.json"
ANALYSIS_SCHEMA_VERSION = 4
ANNOTATION_SCHEMA_VERSION = 4
RULE_SCHEMA_VERSION = 2
SENTENCE_PATTERN = re.compile(
    r".*?[.!?]+(?:[\"'’”’\)\]]+)?(?=\s|$)|.+$",
    re.DOTALL,
)
TOKEN_PATTERN = re.compile(
    r"[A-Za-z]+(?:[’'][A-Za-z]+)*(?:-[A-Za-z]+(?:[’'][A-Za-z]+)*)*"
    r"|\d+(?:,\d{3})*(?:\.\d+)?"
)


class ConfigurationError(RuntimeError):
    """Raised when fixed input, dependency, or annotation data is incompatible."""


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
    lexicon_lemmas: frozenset[str] = frozenset()
    lexicon_pos: frozenset[str] = frozenset()
    match_kind: str = "none"


@dataclass(frozen=True)
class LexiconEntry:
    form: str
    lemma: str
    pos: str


@dataclass(frozen=True)
class LexiconMatch:
    start: int
    end: int
    lemmas: frozenset[str]
    pos: frozenset[str]
    match_kind: str


@dataclass(frozen=True)
class ProgressionRules:
    content_pos: frozenset[str]
    excluded_pos: frozenset[str]
    excluded_dependencies: frozenset[str]
    lexical_pos_compatibility: Mapping[str, frozenset[str]]
    combination_direction: str


@dataclass
class TrieNode:
    children: dict[str, TrieNode] = field(default_factory=dict)
    terminals: set[tuple[str, str]] = field(default_factory=set)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Analyze deterministic progressive learning units from English stdin "
            "or render their validated Chinese prompts."
        )
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--analysis-output",
        type=Path,
        help="write structured sentences, atoms, and learning units to this path",
    )
    mode.add_argument(
        "--render-analysis",
        type=Path,
        help="load analysis JSON and read aligned Chinese prompts JSON from stdin",
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


def load_rules(path: Path = DEFAULT_RULES) -> ProgressionRules:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ConfigurationError(
            f"cannot load progression rules from {path}: {error}"
        ) from error
    if not isinstance(payload, dict):
        raise ConfigurationError("progression rules must be a JSON object")
    _require_exact_keys(
        payload,
        {
            "schema_version",
            "content_pos",
            "excluded_pos",
            "excluded_dependencies",
            "lexical_pos_compatibility",
            "combination_direction",
        },
        "progression rules",
    )
    if payload["schema_version"] != RULE_SCHEMA_VERSION:
        raise ConfigurationError(
            f"progression rules must use schema_version {RULE_SCHEMA_VERSION}"
        )
    content_pos = _non_empty_string_set(payload["content_pos"], "content_pos")
    excluded_pos = _non_empty_string_set(payload["excluded_pos"], "excluded_pos")
    excluded = _non_empty_string_set(
        payload["excluded_dependencies"], "excluded_dependencies"
    )
    raw_compatibility = payload["lexical_pos_compatibility"]
    if not isinstance(raw_compatibility, dict) or not raw_compatibility:
        raise ConfigurationError("lexical_pos_compatibility must be a non-empty object")
    compatibility: dict[str, frozenset[str]] = {}
    for lexical_pos, contextual_pos in raw_compatibility.items():
        if not isinstance(lexical_pos, str) or not lexical_pos:
            raise ConfigurationError(
                "lexical_pos_compatibility keys must be non-empty strings"
            )
        compatibility[lexical_pos] = _non_empty_string_set(
            contextual_pos, f"lexical_pos_compatibility.{lexical_pos}"
        )
    direction = payload["combination_direction"]
    if direction != "right_to_left":
        raise ConfigurationError(
            "progression rules combination_direction must be right_to_left"
        )
    return ProgressionRules(
        content_pos,
        excluded_pos,
        excluded,
        compatibility,
        direction,
    )


def _non_empty_string_set(value: Any, location: str) -> frozenset[str]:
    if (
        not isinstance(value, list)
        or not value
        or not all(isinstance(item, str) and item for item in value)
    ):
        raise ConfigurationError(f"{location} must be a non-empty string list")
    if len(value) != len(set(value)):
        raise ConfigurationError(f"{location} must not contain duplicates")
    return frozenset(value)


def build_trie(entries: Iterable[LexiconEntry]) -> TrieNode:
    root = TrieNode()
    for entry in entries:
        parts = tuple(normalize(part) for part in entry.form.replace("_", " ").split())
        if not parts:
            continue
        node = root
        for part in parts:
            node = node.children.setdefault(part, TrieNode())
        node.terminals.add((normalize(entry.lemma), entry.pos))
    return root


def lexicon_entries(wordnet: wn.Wordnet) -> Iterable[LexiconEntry]:
    seen: set[tuple[str, str, str]] = set()
    for word in wordnet.words():
        lemma = normalize(word.lemma())
        for form in word.forms():
            normalized = normalize(form)
            identity = (normalized, lemma, word.pos)
            if identity not in seen:
                seen.add(identity)
                yield LexiconEntry(normalized, lemma, word.pos)


def token_variants(token: str, lemmatize: Callable) -> dict[str, bool]:
    normalized = normalize(token)
    variants = {normalized: False}
    for lemmas in lemmatize(normalized).values():
        for lemma in lemmas:
            normalized_lemma = normalize(lemma)
            variants.setdefault(normalized_lemma, normalized_lemma != normalized)
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
) -> list[LexiconMatch]:
    variants = [token_variants(token.text, lemmatize) for token in tokens]
    matches: list[LexiconMatch] = []

    for start in range(len(tokens)):
        active_nodes: dict[int, tuple[TrieNode, bool]] = {id(trie): (trie, False)}
        for end in range(start, len(tokens)):
            if end > start and not can_join(sentence, tokens[end - 1], tokens[end]):
                break

            next_nodes: dict[int, tuple[TrieNode, bool]] = {}
            for node, used_morphy in active_nodes.values():
                for variant, variant_uses_morphy in variants[end].items():
                    child = node.children.get(variant)
                    if child is None:
                        continue
                    child_uses_morphy = used_morphy or variant_uses_morphy
                    existing = next_nodes.get(id(child))
                    if existing is None or (existing[1] and not child_uses_morphy):
                        next_nodes[id(child)] = (child, child_uses_morphy)
            if not next_nodes:
                break

            terminal_states = [
                (node, used_morphy)
                for node, used_morphy in next_nodes.values()
                if node.terminals
            ]
            if terminal_states:
                best_uses_morphy = all(used for _, used in terminal_states)
                terminal_states = [
                    (node, used)
                    for node, used in terminal_states
                    if used == best_uses_morphy
                ]
                entries = {
                    entry for node, _ in terminal_states for entry in node.terminals
                }
                matches.append(
                    LexiconMatch(
                        start=start,
                        end=end + 1,
                        lemmas=frozenset(lemma for lemma, _ in entries),
                        pos=frozenset(pos for _, pos in entries),
                        match_kind=("morphy" if best_uses_morphy else "surface"),
                    )
                )
            active_nodes = next_nodes

    return matches


def select_longest_spans(
    token_count: int, candidates: Iterable[LexiconMatch]
) -> list[LexiconMatch]:
    occupied = [False] * token_count
    selected: list[LexiconMatch] = []
    for candidate in sorted(
        candidates,
        key=lambda match: (
            -(match.end - match.start),
            match.start,
            match.end,
        ),
    ):
        if not any(occupied[candidate.start : candidate.end]):
            selected.append(candidate)
            occupied[candidate.start : candidate.end] = [True] * (
                candidate.end - candidate.start
            )
    return sorted(selected, key=lambda match: (match.start, match.end))


def initial_segments(
    token_count: int, lexicon_spans: Sequence[LexiconMatch]
) -> list[Segment]:
    by_start = {match.start: match for match in lexicon_spans}
    segments: list[Segment] = []
    index = 0
    while index < token_count:
        match = by_start.get(index)
        if match is None:
            segments.append(Segment(index, index + 1, "token"))
            index += 1
        else:
            segments.append(
                Segment(
                    match.start,
                    match.end,
                    "oewn",
                    match.lemmas,
                    match.pos,
                    match.match_kind,
                )
            )
            index = match.end
    return segments


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


def _segment_head_pos(
    segment: Segment, tokens: Sequence[Token], syntax: Sequence[SyntaxToken]
) -> str:
    indexes = _syntax_indexes(segment, tokens, syntax)
    heads = _head_indexes(indexes, syntax)
    return syntax[heads[0]].pos if heads else ""


def _segment_head_dep(
    segment: Segment, tokens: Sequence[Token], syntax: Sequence[SyntaxToken]
) -> str:
    indexes = _syntax_indexes(segment, tokens, syntax)
    heads = _head_indexes(indexes, syntax)
    return syntax[heads[0]].dep if heads else ""


def _segment_is_core(
    segment: Segment,
    tokens: Sequence[Token],
    syntax: Sequence[SyntaxToken],
    rules: ProgressionRules,
) -> bool:
    indexes = _syntax_indexes(segment, tokens, syntax)
    heads = _head_indexes(indexes, syntax)
    if any(
        syntax[index].pos in rules.excluded_pos
        or syntax[index].dep in rules.excluded_dependencies
        for index in heads
    ):
        return False

    if segment.source == "oewn":
        if segment.end - segment.start > 1:
            return True
        if any(
            syntax[index].pos
            in rules.lexical_pos_compatibility.get(lexical_pos, frozenset())
            for index in heads
            for lexical_pos in segment.lexicon_pos
        ):
            return True
        return segment.match_kind == "surface"

    return any(syntax[index].pos in rules.content_pos for index in heads)


def find_sentence_atoms(
    sentence: str,
    trie: TrieNode,
    lemmatize: Callable[[str], dict[str | None, set[str]]],
    analyze: Callable[[str], Sequence[SyntaxToken]],
    rules: ProgressionRules,
) -> list[dict[str, Any]]:
    tokens = tokenize(sentence)
    if not tokens:
        return []
    candidates = find_lexicon_spans(sentence, tokens, trie, lemmatize)
    selected = select_longest_spans(len(tokens), candidates)
    segments = initial_segments(len(tokens), selected)
    syntax = analyze(sentence)
    atoms: list[dict[str, Any]] = []
    for segment in segments:
        start = tokens[segment.start].start
        end = tokens[segment.end - 1].end
        atoms.append(
            {
                "text": sentence[start:end],
                "start": start,
                "end": end,
                "source": segment.source,
                "lexicon_lemmas": sorted(segment.lexicon_lemmas),
                "lexicon_pos": sorted(segment.lexicon_pos),
                "match_kind": segment.match_kind,
                "head_pos": _segment_head_pos(segment, tokens, syntax),
                "head_dep": _segment_head_dep(segment, tokens, syntax),
                "core": _segment_is_core(segment, tokens, syntax, rules),
            }
        )
    return atoms


def build_learning_units(
    sentence: str, atoms: Sequence[Mapping[str, Any]]
) -> list[dict[str, Any]]:
    cores = [atom for atom in atoms if atom["core"]]
    units = [
        {
            "text": core["text"],
            "start": core["start"],
            "end": core["end"],
            "kind": "core",
            "core_count": 1,
        }
        for core in cores
    ]
    if len(cores) < 3:
        return units

    right_end = cores[-1]["end"]
    for core_count in range(2, len(cores)):
        left = cores[-core_count]
        start = left["start"]
        units.append(
            {
                "text": sentence[start:right_end],
                "start": start,
                "end": right_end,
                "kind": "composition",
                "core_count": core_count,
            }
        )
    return units


def find_sentence_units(
    sentence: str,
    trie: TrieNode,
    lemmatize: Callable[[str], dict[str | None, set[str]]],
    analyze: Callable[[str], Sequence[SyntaxToken]],
    rules: ProgressionRules,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    atoms = find_sentence_atoms(sentence, trie, lemmatize, analyze, rules)
    return atoms, build_learning_units(sentence, atoms)


def find_chunks(
    sentence: str,
    trie: TrieNode,
    lemmatize: Callable[[str], dict[str | None, set[str]]],
    analyze: Callable[[str], Sequence[SyntaxToken]],
    rules: ProgressionRules,
) -> list[str]:
    _, units = find_sentence_units(sentence, trie, lemmatize, analyze, rules)
    chunks = [unit["text"] for unit in units]
    if not chunks or chunks[-1] != sentence:
        chunks.append(sentence)
    return chunks


def build_analysis(
    sentences: Sequence[str],
    trie: TrieNode,
    lemmatize: Callable[[str], dict[str | None, set[str]]],
    analyze: Callable[[str], Sequence[SyntaxToken]],
    rules: ProgressionRules,
) -> dict[str, Any]:
    analyzed_sentences: list[dict[str, Any]] = []
    for sentence in sentences:
        atoms, units = find_sentence_units(sentence, trie, lemmatize, analyze, rules)
        analyzed_sentences.append(
            {"sentence": sentence, "atoms": atoms, "learning_units": units}
        )
    return {
        "schema_version": ANALYSIS_SCHEMA_VERSION,
        "sentences": analyzed_sentences,
    }


def choose_output_path(requested: Path) -> Path:
    if not requested.exists():
        return requested

    index = 2
    while True:
        if requested.name.endswith(".learning-units.md"):
            base = requested.name[: -len(".learning-units.md")]
            name = f"{base}-{index}.learning-units.md"
        elif requested.name.endswith(".chunks.md"):
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


def _require_int(value: Any, location: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool):
        raise ConfigurationError(f"{location} must be an integer")
    return value


def _validate_sorted_string_list(value: Any, location: str) -> list[str]:
    if not isinstance(value, list) or not all(
        isinstance(item, str) and item for item in value
    ):
        raise ConfigurationError(f"{location} must be a string list")
    if value != sorted(set(value)):
        raise ConfigurationError(f"{location} must be sorted and unique")
    return value


def _validate_range_text(
    sentence: str, value: Mapping[str, Any], location: str
) -> tuple[int, int, str]:
    text = value["text"]
    start = _require_int(value["start"], f"{location}.start")
    end = _require_int(value["end"], f"{location}.end")
    if not isinstance(text, str) or not text.strip():
        raise ConfigurationError(f"{location}.text must be non-empty")
    if start < 0 or end <= start or end > len(sentence):
        raise ConfigurationError(f"{location} must be a non-empty sentence range")
    if sentence[start:end] != text:
        raise ConfigurationError(f"{location}.text must match its sentence range")
    return start, end, text


def validate_analysis(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ConfigurationError("analysis must be a JSON object")
    _require_exact_keys(payload, {"schema_version", "sentences"}, "analysis")
    if payload["schema_version"] != ANALYSIS_SCHEMA_VERSION:
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
        _require_exact_keys(
            raw_sentence, {"sentence", "atoms", "learning_units"}, location
        )
        sentence = raw_sentence["sentence"]
        if not isinstance(sentence, str) or not sentence.strip():
            raise ConfigurationError(f"{location}.sentence must be non-empty")

        raw_atoms = raw_sentence["atoms"]
        if not isinstance(raw_atoms, list) or not raw_atoms:
            raise ConfigurationError(f"{location}.atoms must be a non-empty list")
        atoms: list[dict[str, Any]] = []
        previous_end = -1
        for atom_index, raw_atom in enumerate(raw_atoms):
            atom_location = f"{location}.atoms[{atom_index}]"
            if not isinstance(raw_atom, dict):
                raise ConfigurationError(f"{atom_location} must be an object")
            _require_exact_keys(
                raw_atom,
                {
                    "text",
                    "start",
                    "end",
                    "source",
                    "lexicon_lemmas",
                    "lexicon_pos",
                    "match_kind",
                    "head_pos",
                    "head_dep",
                    "core",
                },
                atom_location,
            )
            start, end, text = _validate_range_text(sentence, raw_atom, atom_location)
            if start < previous_end:
                raise ConfigurationError(f"{atom_location} must not overlap")
            source = raw_atom["source"]
            lexicon_lemmas = _validate_sorted_string_list(
                raw_atom["lexicon_lemmas"], f"{atom_location}.lexicon_lemmas"
            )
            lexicon_pos = _validate_sorted_string_list(
                raw_atom["lexicon_pos"], f"{atom_location}.lexicon_pos"
            )
            match_kind = raw_atom["match_kind"]
            head_pos = raw_atom["head_pos"]
            head_dep = raw_atom["head_dep"]
            core = raw_atom["core"]
            if source not in {"oewn", "token"}:
                raise ConfigurationError(f"{atom_location}.source is unsupported")
            if source == "oewn":
                if not lexicon_lemmas or not lexicon_pos:
                    raise ConfigurationError(
                        f"{atom_location} OEWN evidence must be non-empty"
                    )
                if match_kind not in {"surface", "morphy"}:
                    raise ConfigurationError(
                        f"{atom_location}.match_kind is unsupported"
                    )
            elif lexicon_lemmas or lexicon_pos or match_kind != "none":
                raise ConfigurationError(
                    f"{atom_location} token evidence must be empty"
                )
            if not isinstance(head_pos, str):
                raise ConfigurationError(f"{atom_location}.head_pos must be a string")
            if not isinstance(head_dep, str):
                raise ConfigurationError(f"{atom_location}.head_dep must be a string")
            if not isinstance(core, bool):
                raise ConfigurationError(f"{atom_location}.core must be a boolean")
            atoms.append(
                {
                    "text": text,
                    "start": start,
                    "end": end,
                    "source": source,
                    "lexicon_lemmas": lexicon_lemmas,
                    "lexicon_pos": lexicon_pos,
                    "match_kind": match_kind,
                    "head_pos": head_pos,
                    "head_dep": head_dep,
                    "core": core,
                }
            )
            previous_end = end

        raw_units = raw_sentence["learning_units"]
        if not isinstance(raw_units, list) or not raw_units:
            raise ConfigurationError(
                f"{location}.learning_units must be a non-empty list"
            )
        units: list[dict[str, Any]] = []
        for unit_index, raw_unit in enumerate(raw_units):
            unit_location = f"{location}.learning_units[{unit_index}]"
            if not isinstance(raw_unit, dict):
                raise ConfigurationError(f"{unit_location} must be an object")
            _require_exact_keys(
                raw_unit,
                {"text", "start", "end", "kind", "core_count"},
                unit_location,
            )
            start, end, text = _validate_range_text(sentence, raw_unit, unit_location)
            kind = raw_unit["kind"]
            core_count = _require_int(
                raw_unit["core_count"], f"{unit_location}.core_count"
            )
            if kind not in {"core", "composition"}:
                raise ConfigurationError(f"{unit_location}.kind is unsupported")
            if core_count < 1:
                raise ConfigurationError(f"{unit_location}.core_count must be positive")
            units.append(
                {
                    "text": text,
                    "start": start,
                    "end": end,
                    "kind": kind,
                    "core_count": core_count,
                }
            )

        expected_units = build_learning_units(sentence, atoms)
        if units != expected_units:
            raise ConfigurationError(
                f"{location}.learning_units do not match deterministic progression"
            )
        sentences.append(
            {"sentence": sentence, "atoms": atoms, "learning_units": units}
        )
    return {"schema_version": ANALYSIS_SCHEMA_VERSION, "sentences": sentences}


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
    if payload["schema_version"] != ANNOTATION_SCHEMA_VERSION:
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
            raw_sentence, {"unit_prompts", "sentence_translation"}, location
        )
        prompts = raw_sentence["unit_prompts"]
        translation = raw_sentence["sentence_translation"]
        expected_count = len(analyzed_sentence["learning_units"])
        if not isinstance(prompts, list):
            raise ConfigurationError(f"{location}.unit_prompts must be a list")
        if len(prompts) != expected_count:
            raise ConfigurationError(
                f"{location}.unit_prompts must contain exactly "
                f"{expected_count} items; found {len(prompts)}"
            )
        if not all(isinstance(prompt, str) and prompt.strip() for prompt in prompts):
            raise ConfigurationError(
                f"{location}.unit_prompts must contain only non-empty strings"
            )
        if not isinstance(translation, str) or not translation.strip():
            raise ConfigurationError(
                f"{location}.sentence_translation must be a non-empty string"
            )
        sentences.append(
            {
                "unit_prompts": [prompt.strip() for prompt in prompts],
                "sentence_translation": translation.strip(),
            }
        )
    return {"schema_version": ANNOTATION_SCHEMA_VERSION, "sentences": sentences}


def render_contextual_report(
    analysis: Mapping[str, Any], annotations: Mapping[str, Any]
) -> str:
    lines = ["# 渐进学习单元", ""]
    for index, (analyzed_sentence, annotated_sentence) in enumerate(
        zip(analysis["sentences"], annotations["sentences"], strict=True), start=1
    ):
        lines.extend(
            [
                f"## 第 {index} 句",
                "",
                "| 步骤 | 中文提示 | 英文答案 |",
                "|---:|---|---|",
            ]
        )
        for step, (unit, prompt) in enumerate(
            zip(
                analyzed_sentence["learning_units"],
                annotated_sentence["unit_prompts"],
                strict=True,
            ),
            start=1,
        ):
            lines.append(
                f"| {step} | {markdown_content_escape(prompt)} | "
                f"{markdown_content_escape(unit['text'])} |"
            )
        final_step = len(analyzed_sentence["learning_units"]) + 1
        lines.extend(
            [
                (
                    f"| {final_step} | "
                    f"{markdown_content_escape(annotated_sentence['sentence_translation'])} | "
                    f"{markdown_escape(analyzed_sentence['sentence'])} |"
                ),
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
        trie = build_trie(lexicon_entries(wordnet))
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
        chunks_by_sentence = [
            [unit["text"] for unit in item["learning_units"]] + [item["sentence"]]
            for item in analysis["sentences"]
        ]
        output = write_output(args.output, render_report(chunks_by_sentence))
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
