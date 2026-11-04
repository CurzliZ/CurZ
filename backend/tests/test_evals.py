import pytest

from evals.metrics import (
    fraction,
    hit_at_k,
    honesty_rate,
    raw_quote_fabrication,
    set_precision_recall,
    verified_citation_validity,
)


def test_fraction_returns_null_for_empty_denominator():
    assert fraction(0, 0) == {"rate": None, "numerator": 0, "denominator": 0}


def test_quote_metrics_calculate_observed_rates():
    assert raw_quote_fabrication(10, 3)["rate"] == 0.3
    assert verified_citation_validity(4, 4)["rate"] == 1


def test_post_verification_metric_rejects_an_invalid_displayed_citation():
    with pytest.raises(ValueError, match="failed verification"):
        verified_citation_validity(3, 2)


def test_relationship_precision_and_recall_compare_labeled_sets():
    precision, recall = set_precision_recall(
        {"a", "b", "extra"},
        {"a", "b", "missing", "other"},
    )
    assert precision == {"rate": 2 / 3, "numerator": 2, "denominator": 3}
    assert recall == {"rate": 0.5, "numerator": 2, "denominator": 4}


def test_retrieval_and_unanswerable_rates():
    assert hit_at_k(2, 4, 8) == {
        "rate": 0.5,
        "numerator": 2,
        "denominator": 4,
        "k": 8,
    }
    assert honesty_rate(0, 0)["rate"] is None


def test_invalid_metric_counts_are_rejected():
    with pytest.raises(ValueError):
        fraction(2, 1)
