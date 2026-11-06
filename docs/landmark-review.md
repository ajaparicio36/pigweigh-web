# Optional landmark review API

Photo validation can return measurement diagnostics from the same inference pass. Adjustments are optional; a normal estimate still requires only the two files. Every HTTP estimate includes versioned provenance. A manual adjustment is an image-space input from the visitor, not proof of anatomical correctness, physical marker scale, pig identity or weight accuracy. The service does not retain photos or edits.

`POST /api/photos/{top|side}/validate?diagnostics=true` returns the normal validation result plus `diagnostics`. Omitting the query keeps the original validation response. The diagnostic view contains `version:1`, `coordinate_space:"exif-oriented-pixels"`, `view`, oriented `width`/`height`, the SHA-256 of the exact uploaded bytes, a flat row-major nine-number `image_to_marker` homography, detected `[x1,y1,x2,y2]` `bounding_box`, `model_score` and `model_score_semantics`. The side adapter reports `source_weight_class`; other model interfaces report `model_detection`. Neither value is weight certainty.

`landmarks` contains every named model point. Each entry has `detected:[x,y]`, `used:[x,y]` for a measured anchor or `null` for other points, `confidence` (or `null` if an otherwise-unused score is outside its valid range), and `within_image`. Low-confidence or out-of-image unused points remain visible in the record without adding a rejection gate. `segments` uses image-space endpoints: top `body_length` and `chest_width`, side `chest_depth`. The top length starts at the inverse-projected midpoint of the two ear positions in the marker plane, not their image-space average.

`POST /api/estimates` accepts the original two files and an optional multipart **text field** `adjustments` with this exact JSON shape:

```json
{
  "version": 1,
  "bundle_id": "<bundle_id from both photo checks>",
  "image_sha256": {"top": "<exact top upload sha256>", "side": "<exact side upload sha256>"},
  "overrides": {"top": {}, "side": {"sternum": [200.0, 300.0]}}
}
```

Only top `left-ear-base`, `right-ear-base`, `tail-base`, `left-chest`, `right-chest` and side `withers`, `sternum` may be adjusted. Coordinates must be finite non-boolean numbers inside the oriented image and detected pig bounding box. JSON is bounded to 8 KiB and rejects duplicate or unknown keys. The exact uploaded file hashes and bundle ID must match the photo checks. A changed photo or model returns `409 stale_review` with `details.reason` of `image_changed` or `bundle_changed`; keep the files and draft edits while asking for fresh checks and review. Invalid JSON returns `422 invalid_adjustments`; a changed coordinate outside the image or box returns `422 adjustment_outside_image` or `422 adjustment_outside_pig`.

The final request always decodes and reruns both original images and applies the original marker, detection, required-landmark and projection gates before an adjustment. Adjusted points must also project and produce usable final measurements. Coordinates equal to the original detected point are dropped; an all-no-op request is reported as `automatic`.

The top-level `provenance` records `version`, `source` (`automatic` or `manually_adjusted`), `bundle_id`, `method_version`, both upload hashes, all named `landmarks` with detected/used points and confidence, actual `overrides`, and the formula/marker `configuration`. A manually adjusted result always includes full two-view `diagnostics`; an automatic result includes them when `?diagnostics=true` is requested. Missing or inconsistent review provenance fails closed with `503 review_provenance_unavailable`. The estimate still uses G²L/14451 and a Decimal price snapshot read after CPU inference.

## Working PowerShell and curl example

Start the API with the dedicated local database and origin described in [the server README](../server/README.md#development). Replace these local image paths with the two exact files to review. The one-pixel adjustment demonstrates the wire format; select an anatomically supported point during real review.

```powershell
$base = 'http://127.0.0.1:8000'
$origin = 'http://localhost:3000'
$top = 'D:/captures/top.jpg'
$side = 'D:/captures/side.jpg'

$topCheck = (& curl.exe -sS --fail-with-body -H "Origin: $origin" `
  -F "image=@$top" "$base/api/photos/top/validate?diagnostics=true") | ConvertFrom-Json
$sideCheck = (& curl.exe -sS --fail-with-body -H "Origin: $origin" `
  -F "image=@$side" "$base/api/photos/side/validate?diagnostics=true") | ConvertFrom-Json
if ($topCheck.status -ne 'validated' -or $sideCheck.status -ne 'validated' -or
    $topCheck.artifacts.bundle_id -ne $sideCheck.artifacts.bundle_id) { throw 'Recheck both photos' }

# Optional: inspect the ordinary automatic result and both diagnostic views.
& curl.exe -sS --fail-with-body -H "Origin: $origin" `
  -F "top_image=@$top" -F "side_image=@$side" "$base/api/estimates?diagnostics=true"

$point = $sideCheck.diagnostics.landmarks.sternum.detected
$box = $sideCheck.diagnostics.bounding_box
$x = if ($point[0] + 1 -lt [Math]::Min($box[2], $sideCheck.diagnostics.width)) { $point[0] + 1 } else { $point[0] - 1 }
$edits = @{
  version = 1
  bundle_id = $topCheck.artifacts.bundle_id
  image_sha256 = @{ top = $topCheck.diagnostics.image_sha256; side = $sideCheck.diagnostics.image_sha256 }
  overrides = @{ top = @{}; side = @{ sternum = @($x, $point[1]) } }
} | ConvertTo-Json -Depth 10 -Compress
& curl.exe -sS --fail-with-body -H "Origin: $origin" `
  -F "top_image=@$top" -F "side_image=@$side" --form-string "adjustments=$edits" "$base/api/estimates"
```

The example was exercised on a task-owned loopback API using hash-verified generated images and the candidate CPU bundle. Both photo checks, automatic diagnostics and a manually adjusted estimate returned 200. That separate curl run stubbed the price read as absent. An independent disposable PostgreSQL test covered authenticated price publication and Decimal valuation for an adjusted result. Generated fixtures do not establish field accuracy.
