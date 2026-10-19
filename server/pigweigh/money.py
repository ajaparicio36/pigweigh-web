from decimal import Decimal, ROUND_HALF_UP, localcontext
import re

MAX_BIGINT = 2**63 - 1


def parse_price(value: str) -> int:
    if not re.fullmatch(r"[0-9]{1,18}(?:\.[0-9]{1,2})?", value):
        raise ValueError("Use a positive PHP amount with at most two decimal places")
    amount = int(Decimal(value) * 100)
    if not 0 < amount <= MAX_BIGINT:
        raise ValueError("Price is outside the supported range")
    return amount


def format_price(centavos: int) -> str:
    return f"{centavos // 100}.{centavos % 100:02d}"


def valuation(weight_kg: Decimal, price: dict | None) -> dict | None:
    """Pure arithmetic only; never used to fabricate an inference result."""
    if not weight_kg.is_finite() or weight_kg <= 0:
        raise ValueError("Weight must be finite and positive")
    if price is None:
        return None
    with localcontext() as context:
        context.prec = 64
        amount = (weight_kg * Decimal(price["php_per_kg"])).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return {"amount_php": str(amount), "price": dict(price)}
