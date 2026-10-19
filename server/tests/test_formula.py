"""Measurement arithmetic only: these fixtures are not pig accuracy evidence."""
from math import pi

import pytest

from pigweigh.formula import ellipse_girth_cm, estimate_weight_kg


def test_selected_metric_divisor_and_length_scaling():
    assert estimate_weight_kg(100, 100) == pytest.approx(84.03361344537815)
    assert estimate_weight_kg(100, 200) == pytest.approx(2 * estimate_weight_kg(100, 100))
    assert estimate_weight_kg(200, 100) == pytest.approx(4 * estimate_weight_kg(100, 100))


def test_ellipse_circle_symmetry_and_uniform_scaling():
    assert ellipse_girth_cm(20, 20) == pytest.approx(20 * pi)
    assert ellipse_girth_cm(6, 4) == pytest.approx(15.865439589251233)
    assert ellipse_girth_cm(6, 4) == ellipse_girth_cm(4, 6)
    assert ellipse_girth_cm(12, 8) == pytest.approx(2 * ellipse_girth_cm(6, 4))
    assert estimate_weight_kg(ellipse_girth_cm(12, 8), 100) == pytest.approx(
        8 * estimate_weight_kg(ellipse_girth_cm(6, 4), 50))


@pytest.mark.parametrize("value", [0, -1, float("nan"), float("inf"), -float("inf"), True])
def test_invalid_inputs_rejected_in_each_measurement(value):
    for function in (ellipse_girth_cm, estimate_weight_kg):
        with pytest.raises(ValueError):
            function(value, 20)
        with pytest.raises(ValueError):
            function(20, value)


def test_final_overflow_and_underflow_rejected():
    with pytest.raises(ValueError):
        ellipse_girth_cm(1e308, 1e308)
    with pytest.raises(ValueError):
        estimate_weight_kg(1e308, 1e308)
    with pytest.raises(ValueError):
        estimate_weight_kg(1e-300, 1e-300)


def test_representable_extreme_calculation_avoids_intermediate_overflow():
    assert ellipse_girth_cm(1e300, 1e300) == pytest.approx(pi * 1e300)
    assert estimate_weight_kg(1e200, 1e-200) == pytest.approx(1e200 / 11900)
