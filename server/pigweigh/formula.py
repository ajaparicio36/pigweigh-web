"""Experimental measurement arithmetic, independent of photo inference and money.

The user selected G_cm**2 * L_cm / 11900. The reference describes tape girth
behind the front legs/over the shoulder blades and length along the spine from
ear base to tail base. An ellipse from photographic chest width/depth is a
girth proxy, not a measured tape circumference or a validated weight method.
"""
from math import frexp, isfinite, ldexp, pi, sqrt


def _positive_finite(value: float, name: str) -> None:
    if isinstance(value, bool) or not isfinite(value) or value <= 0:
        raise ValueError(f"{name} must be finite and positive")


def ellipse_girth_cm(chest_width_cm: float, chest_depth_cm: float) -> float:
    """Ramanujan II circumference with semiaxes width/2 and depth/2.

    Normalize by the larger diameter to avoid squaring or adding large axes.
    This geometric approximation does not validate a pig's chest cross-section.
    """
    _positive_finite(chest_width_cm, "Chest width")
    _positive_finite(chest_depth_cm, "Chest depth")
    diameter = max(chest_width_cm, chest_depth_cm)
    ratio = min(chest_width_cm, chest_depth_cm) / diameter
    h = ((1 - ratio) / (1 + ratio)) ** 2
    factor = (pi / 2) * (1 + ratio) * (1 + 3 * h / (10 + sqrt(4 - 3 * h)))
    girth = diameter * factor
    _positive_finite(girth, "Ellipse circumference")
    return girth


def estimate_weight_kg(girth_cm: float, body_length_cm: float) -> float:
    """User-selected experimental G²L/11900, with inputs in cm and output kg.

    Accepts already obtained measurements; never infers dimensions from photos.
    Mantissa/exponent arithmetic avoids intermediate G² overflow when the final
    value is representable. Unrepresentable/underflowed results are rejected.
    """
    _positive_finite(girth_cm, "Girth")
    _positive_finite(body_length_cm, "Body length")
    girth_mantissa, girth_exponent = frexp(girth_cm)
    length_mantissa, length_exponent = frexp(body_length_cm)
    try:
        weight = ldexp(girth_mantissa * girth_mantissa * length_mantissa / 11900,
                       2 * girth_exponent + length_exponent)
    except OverflowError as exc:
        raise ValueError("Calculated weight is outside the finite numeric range") from exc
    _positive_finite(weight, "Calculated weight")
    return weight
