# PigWeigh

PigWeigh concerns estimating a pig's live weight from a paired photographic capture and expressing its estimated monetary value using a published price per kilogram.

## Language

**Capture pair**:
A top-view photo and a side-view photo of the same pig supplied for one estimation request.
_Avoid_: single-photo estimate, stereo pair

**Estimated live weight**:
An inferred mass of the living pig, expressed in kilograms.
_Avoid_: carcass weight, measured weight

**Ground-truth weight**:
The pig's live weight measured on a scale; its association with a photo or capture session identifies what observation it can validate.
_Avoid_: predicted label, estimated weight

**Dataset weight class**:
A source photo's class representing the pig's actual scale weight, as confirmed by the user; it does not establish that a matching view of the same animal exists.
_Avoid_: pose class, capture pair

**Price record**:
An admin-published Philippine peso amount per kilogram, with its source reference and effectivity information.
_Avoid_: pig price, total price

**Valuation**:
Estimated live weight multiplied by the applicable price per kilogram, expressed in Philippine pesos.
_Avoid_: guaranteed sale price, payment

**Admin**:
A person authorized to publish price records after signing in.
_Avoid_: anonymous visitor, self-registering customer

**Anonymous visitor**:
A person who requests an estimate without an admin account.
_Avoid_: admin, registered user

**ArUco marker**:
A coded square reference with a known physical size used as evidence for capture geometry.
_Avoid_: universal photo scale
