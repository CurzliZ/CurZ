from collections.abc import Iterable
from typing import TypeVar

T = TypeVar("T")


def fraction(numerator: int, denominator: int) -> dict[str, int | float | None]:
    if denominator < 0 or numerator < 0 or numerator > denominator:
        raise ValueError("Metric counts must satisfy 0 <= numerator <= denominator.")
    return {
        "rate": numerator / denominator if denominator else None,
        "numerator": numerator,
        "denominator": denominator,
    }


def raw_quote_fabrication(raw_quotes: int, fabricated_quotes: int) -> dict:
    return fraction(fabricated_quotes, raw_quotes)


def verified_citation_validity(
    displayed_citations: int, citations_that_verify: int
) -> dict:
    if displayed_citations != citations_that_verify:
        raise ValueError("A displayed post-verification citation failed verification.")
    return fraction(citations_that_verify, displayed_citations)


def set_precision_recall(
    predictions: Iterable[T], expected: Iterable[T]
) -> tuple[dict, dict]:
    predicted_set = set(predictions)
    expected_set = set(expected)
    true_positives = len(predicted_set & expected_set)
    return (
        fraction(true_positives, len(predicted_set)),
        fraction(true_positives, len(expected_set)),
    )


def hit_at_k(hit_count: int, answerable_count: int, k: int) -> dict:
    if k < 1:
        raise ValueError("k must be a positive integer.")
    return {**fraction(hit_count, answerable_count), "k": k}


def honesty_rate(honest_count: int, unanswerable_count: int) -> dict:
    return fraction(honest_count, unanswerable_count)
