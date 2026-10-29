---
name: PigWeigh
description: A clear, paired-photo estimation tool in the original cream and red identity.
colors:
  primary: "#A40000"
  primary-dark: "#6A1314"
  background: "#F3EBDF"
  foreground: "#30231D"
  muted: "#675A4E"
  surface: "#FFFFFF"
  surface-soft: "#FAF6EF"
  border: "#CCC0B0"
  control-border: "#887A6B"
  error-surface: "#FFF2EF"
typography:
  heading:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "2rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.03em"
  body:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.5
rounded:
  control: "8px"
  panel: "12px"
spacing:
  small: "8px"
  medium: "16px"
  group: "20px"
  section: "28px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "11px 20px"
  button-primary-hover:
    backgroundColor: "{colors.primary-dark}"
    textColor: "{colors.surface}"
  button-secondary:
    textColor: "{colors.primary-dark}"
    rounded: "{rounded.control}"
    padding: "11px 20px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.panel}"
---

# Design System: PigWeigh

## Overview

The interface puts the photo pair and price publication tasks first. A cream canvas, dark red navigation and red primary actions preserve the incumbent identity. System typography and native controls keep repeated actions familiar.

This record describes the code-led implementation from the user's brief and lead direction, with no approved visual comp. It is not a claim of browser QA, model readiness or institutional affiliation. The incumbent home/login images were visually inspected for context but are not shipped.

## Colors

Cream is the page ground; white identifies photo and form work areas. Dark red carries navigation, the wordmark and selected emphasis. Primary red identifies the main action and error text. Muted brown supports help and provenance. Structural borders use the inherited light brown; input borders use a darker brown for visibility.

Text selection and carets use the primary palette. Visible focus uses a 3px red outline with a 4px offset; the dark header uses cream focus instead. The interface deliberately preserves the requested light cream identity.

## Typography

One system sans family serves headings, forms and data. Desktop page headings use the heading token; narrow layouts use 1.75rem. Section titles are 1.125rem, body text is 1rem, labels are 0.875rem and helper/provenance text is 0.8125rem. Financial data uses tabular numerals and exact decimal strings. Prose stays within approximately 65–75 characters where its context permits.

## Layout

Content has a maximum width of 72rem including 2rem side padding. Below 768px, padding becomes 1rem and paired photo cards, price provenance, login columns, result metrics and publication fields stack. Photo review frames use contain sizing and a constrained grid track so the complete uploaded photo remains visible. [October 30 QA](docs/qa-photo-validation.md) verified the clipping fix with square, landscape and portrait images at desktop and actual 390 px; its 32 bounded assertions distinguish actual-model flows from HTTP state harnesses. Separate [production QA](docs/qa-photo-validation.md#production-ui-verification-2026-10-30) passed seven bounded headless scenarios and a graphical top-upload/status/containment check after the [release build-cache repair](docs/deployment.md#api-and-web-update-per-photo-validation-2026-10-30); desktop and actual 390 px previews contain the full source images. Hardware behavior remains unverified. Primary actions move below their context and span the available width on phones.

Keep related labels and helpers close, with larger separation between tasks. Navigation stays compact with explicit Estimate, Admin and Print marker links; `/marker` identifies its active item. Source references and large exact prices wrap rather than forcing horizontal overflow.

## Elevation & Depth

Surfaces use borders and tonal layers without shadows. Cream, soft white and white distinguish page, supporting information and editable areas. Status messages remain inline with the action that produced them.

## Shapes

Panels and photo cards use the panel radius. Inputs and buttons use the control radius. Native file buttons use a 6px radius. There are no pills, decorative masks or raster backgrounds.

## Components

Buttons have visible focus, disabled and pending states. Primary buttons use red with white text; secondary controls use a dark red label and visible border. Pointer press feedback scales to 0.98 over 160ms with the shared ease-out curve. Keyboard focus is immediate; reduced motion removes the transform. Hover rules apply only to fine pointers that support hover.

Inputs use permanent labels and associated helper/error text. Price entry accepts a decimal string; formatting never converts money through a floating-point number. Photo inputs retain native file selection, show the whole selected image and allow replacement or removal. Temporary preview URLs are released on replacement/unmount. Each photo card also offers Take photo; a native dialog starts camera access only after that action, prefers the rear camera and requests no audio. The preview uses manual whole-pig and view-specific back/flank marker guides, with an explicit no-live-detection explanation. Capturing saves the intrinsic video frame without guides into the same File review/upload flow.

After a successful photo selection or capture, upload that File for automatic validation and show its state inline with the review: checking, passed, rejected or recoverable Retry. Serialize top/side checks. Tie results to the current File object and view so replacement, removal or a same-name File cannot inherit a stale pass/error. Interrupted checks show Retry when returning from navigation. Rejected photos ask for replacement; network, unavailable and busy states preserve the photo for retry. Keep the estimate action and submit handler gated until both current checks pass.

Explain beside the capture flow that selected photos upload automatically for checking, live camera video stays local, photos are not retained and final submission uploads/rechecks the pair. A passed status reflects the existing per-view engineering gates; it must not imply identity, physical scale or accuracy certification. Camera overlays remain manual guides, with checks only after capture/upload.

The camera dialog has a labeled title, Close, Capture photo and Use upload instead controls, visible pending/error states and keyboard focus return. Closing, Escape, navigation or tab hiding releases tracks; late permission/encoding completion cannot revive a dismissed session. Upload remains available when camera access fails. At the tested 390 × 844 viewport the complete modal/actions fit; see [bounded browser evidence](docs/qa-marker-camera.md), not a physical-phone certification.

The Print marker page shows a fixed SVG preview, accepted dictionary/ID/black-square size and a prominent A4 PDF download. Keep printing guidance adjacent: 100% / Actual size, no Fit to page, ruler-check 100 mm black edges, and preserve the white quiet zone. A 4 × 4 data grid and 50 available IDs describe the dictionary, separately from physical dimensions; compatibility is not comparative accuracy evidence. See [asset verification](docs/marker-assets.md).

The price strip separates amount from source and publication time. Empty and failed price states remain distinct. Readiness explains actual service blockers; unavailable submissions never display numeric results. Admin publication conflicts retain the draft and require explicit review of the refreshed price.

## Do's and Don'ts

- Do preserve the cream/red identity and familiar native form behavior.
- Do show server-derived prices, provenance and status truthfully.
- Do preserve visible keyboard focus, structural mobile stacking and reduced-motion support.
- Don't add live recognition/model overlays, invented weights, confidence, valuations or institutional affiliation. Manual camera guides must never be encoded into a captured photo.
- Don't animate numbers or move readable data for decoration.
- Don't hide errors in temporary notifications or replace labels with placeholders.
