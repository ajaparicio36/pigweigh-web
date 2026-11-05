# PigWeigh pilot versions

These branches track the web app prototypes used for the pilot. Version 2.2 was a separate capture experiment. Version 2.3 continued from 2.1.

| Branch | Changes |
| --- | --- |
| [v2](https://github.com/ajaparicio36/pigweigh-web/tree/v2) | Starting snapshot with bundled YOLO Pose models, a printable 100 mm ArUco marker, guided camera capture, per-photo validation and paired weight estimation. |
| [v2.1](https://github.com/ajaparicio36/pigweigh-web/tree/v2.1) | Added guided auto capture. The app samples camera frames and saves a frame that passes the server's pig and marker checks. |
| [v2.2](https://github.com/ajaparicio36/pigweigh-web/tree/v2.2) | Tried a stricter ArUco alignment gate with browser-side checks before submitting an auto-capture frame. |
| [v2.3](https://github.com/ajaparicio36/pigweigh-web/tree/v2.3) | Continued from v2.1 capture behavior, added labeled photo saving for pilot attempts and updated the baseline to girth² × length ÷ 14,451 with centimeters and kilograms. |
| [v2.4](https://github.com/ajaparicio36/pigweigh-web/tree/v2.4) | Added capture and measurement checks, result overlays, and a per-attempt ZIP with original photos and estimation data. |
| [v2.5](https://github.com/ajaparicio36/pigweigh-web/tree/v2.5) | Added point review before weight calculation, inspected photo exports, and reopening saved pilot ZIPs. Adjusted views retain the original and applied point coordinates. |
| [v2.6](https://github.com/ajaparicio36/pigweigh-web/tree/v2.6) | Added an optional rear camera light during guided capture on devices that expose torch control. |
| [codex/marc-v2.7](https://github.com/ajaparicio36/pigweigh-web/tree/codex/marc-v2.7) | Saves the local spine-midpoint trial, mobile camera layout adjustments, and stand-placement instructions. Moving M in top-view review uses a two-segment length path. An untouched M keeps the straight measurement. |
| [codex/marc-wf-review](https://github.com/ajaparicio36/pigweigh-web/tree/codex/marc-wf-review) | Separate v2.6-based experiment with an editable orange W–F line alongside the cyan W–S depth measurement. The inspection export includes both lines. W–S supplies chest depth to the girth calculation. |
