# Roboflow plugin schema audit

> **Current update, 2026-10-19:** Subsequent user authorization selected the Roboflow projects as canonical and permitted separate local preparation. The named mappings were reviewed, representative top raw/export checks were added, and independent prepared copies were created and validated at `D:/pigweigh-pose-prepared-roboflow-v1/{top-view,side-view}`. See [pose preparation](pose-preparation.md) for accepted schemas, exact coverage/masks/exclusions, preservation proof, and runnable training commands. The prior no-conversion authorization boundary and source-export training hold below describe the earlier audit stage; they do not block pose training on the reviewed prepared copies. Original annotations/projects/exports remain unchanged, and annotation noise is reported rather than silently corrected. No training or GPU execution was performed.

Reviewed 2026-10-19. The plugin was inspected first; the user then explicitly authorized read-only browser fallback. No remote annotation/class/skeleton changes, dataset generation/export, uploads, keys, inference, training, or local dataset changes occurred. Only this report was written. Browser findings below supersede the initial plugin-only metadata limitation, not its tool inventory.

## Selected scope and verified access

Workspace slug supplied by the user: `maria-antonette-efren`.

| Selected project | Version scope | Authenticated read evidence |
|---|---|---|
| `pigweight_side-znzvb` | User selected `/1`; local YAML identifies version 1 | `annotation_board_status` succeeded with the workspace-qualified slug: Dataset 839 images in 14 jobs; Annotating 368 images in 3 jobs. |
| `pigweight_top-aizjl` | Project URL; local YAML identifies version 1 | `annotation_board_status` succeeded with the workspace-qualified slug: Dataset 998 images in 16 jobs; Annotating 153 images in 4 jobs. |

Calls used `include_items=false, limit=1`. Counts describe the current annotation board, not version-1 membership, exported augmentation counts, or verified skeletons. No internal workspace/project identifier was returned by this endpoint. Personnel rollups were excluded from this report.

## Capability boundary

The enabled Roboflow tool inventory exposed 33 tools, from `agent_chat` through `api_keys_get`. It included annotation-board, batch, job, image-ID-listing, editor, mutation, and key operations. It did not expose `projects_get`, `versions_get`, project/class/skeleton reads, source-image annotation reads, or version export metadata. No unsupported tool name was called. The Roboflow namespace was subsequently removed from the session catalog; no removed tool was retried.

A narrowly scoped `agent_chat(mode="plan")` request explicitly prohibited mutations, exports, training, inference, keys, and paid compute. It requested named point IDs/order/edges per class, version-1 versus current metadata, and the three sample annotations. The completed response reported that its available tools could not inspect these records; its focused documentation searches returned `no_results`. It supplied no directly inspected metadata. This is a capability limitation, not evidence that access to the two selected projects is denied: direct annotation-board reads succeeded afterward.

Native MCP resource and template discovery returned workflows/evaluation schemas, skills, and an annotation-editor widget; it exposed no project/version/schema records. The editor was not opened. The connected plugin's data-management and API-reference skills were read; they describe capabilities that are not all enabled in this session.

Through the plugin alone, authoritative named keypoint IDs/order, per-class schemas, skeleton edges, version-1 schema snapshots, YOLO export-order rules for these projects, and the original three annotations could not be retrieved. The subsequently authorized browser inspection recovered current class names and three original annotation arrays, documented below. Current project metadata cannot be equated with immutable version-1 metadata. No source-to-export remap is certified for the entire dataset.

## Discrepancies remain unresolved

The [existing sampled evidence](training-readiness.md) and [user-supplied guide](../conversations/landmarks.md) remain unchanged:

- Guide top flip order differs from the local top YAML.
- In side sample `IMG_1556_jpeg_jpeg.rf.d047d6b9ad83361b6625d09854088f01`, indices 10 and 12 lie on torso and rear hoof respectively; the guide declares rear hoof and belly respectively.
- In class-0 sample `IMG_1865_jpeg_jpeg.rf.97d43a9fdb58370efdf5800d70777a2e`, index 10 lies at the rear hoof and 12 on ventral torso. One universal inferred 9-12 remap is not justified.
- In head-left class-12 sample `IMG_3517_jpeg_jpeg.rf.9f6c474b80cd5106bb6072e8c6917f30`, indices 7/8 lie on the rear leg despite declared front-leg semantics.

These observations establish a guide/export conflict. Browser evidence below now shows different current per-class skeleton sequences and exact positional correspondence between three original annotation arrays and their local exported slots. It does not prove the correct anatomical placement of every named point, a general exporter rule, or frozen named schemas for all version-1 classes. The local exports are not proven faulty: interpreting every class through one guide is demonstrably unsafe.

## Minimal safe next step

Keep the pose-training recommendation on hold. Disabled flips and `single_cls=True` cannot reconcile existing semantic differences. Authentication/pricing/upload software remains independently implementable; anatomical inference and calibrated weight results remain blocked.

Before approving conversion, obtain frozen version-1 named skeleton IDs/definitions or an annotation-owner confirmation tying original IDs to names for every class. No API secrets or signed media URLs are needed. Verify all source classes and both orientations, comparing point IDs/names/coordinates with the frozen export. The current UI sequences below provide a concrete draft starting point, not blanket approval to relabel points.

If reconciliation proves necessary, propose a reviewed conversion into a separate prepared dataset with immutable original files, source class-to-scale-weight metadata, image/pig/session provenance, explicit per-view index mappings, and checks on representative classes/orientations. A conversion must not pair different pigs merely because scale weights match. Source/shared class, annotation, group, skeleton, version changes or local label remapping require a separately approved concrete mutation plan; none is authorized by this audit.

Annotation-owner question: Which original named keypoint ID/order applies to each weight class and orientation, and what does version 1 export? Please reconcile the three sample positions before endorsing one canonical per-view schema.

## Evidence and checks

- Local evidence: existing `D:/pigweigh-pose-data/top-view/data.yaml`, `side-view/data.yaml`, the guide, and prior sampled image/label inspection cited in `training-readiness.md`.
- Plugin evidence: exact enabled-tool metadata; completed read-only `agent_chat`; successful `annotation_board_status` calls for both workspace-qualified project slugs; `list_mcp_resources(server="roboflow")`; `list_mcp_resource_templates(server="roboflow")`.
- Both project board calls returned non-error responses. No schema or version read was available through the plugin; browser evidence below improves coverage but anatomical consistency and training readiness still did not pass.
- Report checked for balanced Markdown fences, trailing whitespace, valid local document links, and absence of credentials/personnel details.

## Authorized browser evidence

The user explicitly confirmed shared-browser availability for Roboflow inspection. Read the computer-use skill, guidance and confirmations. Inventory identified Chrome browser ID `4`, profile `Anthony John`, existing tab ID `1347450107`, initially `PIGWEIGHT_TOP > Train`. Session named `Pig landmark audit`. No unrelated tab, OAuth callback, credentials page, ChatGPT conversation, or account settings were opened. All browser interactions used documented Cua APIs.

Inspected each class's existing Edit Keypoints dialog, read DOM-backed visible contenteditable names, and dismissed using Cancel. No point text, position, edge, symmetry, class or annotation was changed or saved. One existing point was selected for property inspection without moving it; its dialog was cancelled. One first-class top skeleton screenshot was viewed inline; no screenshot file was persisted. Browser was left on the side version-1 overview with no editor dialog open.

Sources:

- [Top current classes](https://app.roboflow.com/maria-antonette-efren/pigweight_top-aizjl/settings): 16 classes; all 16 current name sequences read.
- [Side current classes](https://app.roboflow.com/maria-antonette-efren/pigweight_side-znzvb/settings): 14 classes; all 14 current name sequences read. Additional `31_side` has two objects in the current UI and is absent from the local version-1 YAML's 13 classes. Do not substitute current schemas/counts for frozen metadata.
- [Side version 1](https://app.roboflow.com/maria-antonette-efren/pigweight_side-znzvb/1): `2026-10-19-prefill`, 2015 images; 1764 train / 124 valid / 127 test; auto-orient and 640x640 fit with black edges; three outputs per training example and listed color/brightness augmentations; no trained model. A download link was visible but no export/download was requested.
- Top initial Train page visibly listed saved version 1 `2026-10-19-prefill`, 2400 images, 16 classes, separately from current dataset 998 images. No training controls were activated. Frozen version-1 named skeletons were not exposed on the inspected overview.

### Current named point sequences: all 30 classes

These are exact visible DOM sequences, preserving spelling/case/punctuation. **Position in these lists is not independently certified as frozen version-1 YOLO index.** Numeric source point IDs are available separately for the three annotation samples below. Names, including `tail-tip` versus `tail-base`, must not be normalized as equivalent anatomy without review.

Top shared sequence T: `snout-tip, left-ear-base, right-ear-base, left-shoulder, right-shoulder, left-chest, right-chest, left-hip, right-hip, tail-base, spine-midpoint`.

| Current top class | Exact DOM name sequence |
|---|---|
| `16KG_Top` | `Snout-tip, left-shoulder, left-chest, left-hip, tail-base, right-hip, right-chest, right-shoulder, spine-midpoint, left-ear-base, right-ear-base` |
| `17_TOP` | `snout-tip, left-ear-based, left-shoulder, left-chest, left-hip, tail-base, right-hip, right-chest, right-shoulder, right-ear-based, midpoint-spint` |
| `18_top` | T |
| `19_top` | T |
| `20-TOP` | `snout-tip, left-ear-based, left-shoulder, left-chest, left-hip, tail-tip, right-hip, right-chest, right-soulder, right-ear-based, midpoint-spine` |
| `22-TOP` | `snout-tip, left-ear-based, left-shoulder, left-chest, left-hip, tail-based, right-hip, right-chest, right-shoulder, right-ear-based, midpoint-spine` |
| `23_top` | T |
| `27_top` | T |
| `28_top` | T |
| `29-TOP` | `snout, left-ear-base, left-shoulder, left-chest, left-hip, tail, right-hip, right-chest, rights-shoulder, right-ear-base, midpoint-spine` |
| `30_top` | T |
| `31_top` | T |
| `34-TOP` | `snout, left-ear-based, left-shoulder, left-chest, left-hip, tail-based, right-hip, right-chest, right-shoulder, right-ear-based, midpoint-spine` |
| `35-TOP` | `snout, right-ear-base, left-ear-base, left-shoulder, right-shoulder, spine-midpoint, left-chest, right-chest, left-hip, right-hip, tail-base` |
| `36-TOP` | `snout-tip, left-ear-base, right-ear-base, Left-shoulder, right-shoulder, left-chest, right-chest, tail-base, snipe-midpoint, left-hip, right-hip` |
| `38-TOP` | `snout-tip, right-ear-base, left-ear-base, right-shoulder, left-shoulder, right-chest, left-chest, right-hip, left-hip, tail-base, spine-midpoint` |

Side exact prefixes:

- A: `Snout_Tip-occluded-if-not-seen-, Eye, Ear_Tip-head_reference-, Withers-between_neck_shoulder_starts-, Mid_Point_Peak, Loin-before_or_around_hips-, Tail_Base`.
- B: `Snout_Tip., Eye, Ear_Tip, Withers-between_neck_shoulder_starts-, Mid_Point_Peak, Loin-before_or_around_hips-, Tail_Base`.
- F: `Front-Shoulder-Joint, Front_Hoof-attach_to_ground-, -Belly-Lowest-Part, -Sternum-behind_leg-, Rear_Hip-Joint, Rear_Hip-attach-to-ground-`.
- R: `Rear_Hip-Joint, Rear_Hip-attach-to-ground-, -Sternum-behind_leg-, -Belly-Lowest-Part, Front-Shoulder-Joint, Front_Hoof-attach_to_ground-`.

Concatenation below means literal sequence concatenation, not a verified ID mapping.

| Current side class | Exact DOM name sequence |
|---|---|
| `16_side` | `Snout_Tip-occluded-if-not-seen-, Eye, Ear_Tip-head_reference-, Withers-between_neck_shoulder_starts-, Loin-before_or_around_hips-, Tail_Base, Mid_Point_Peak, Front-Shoulder-Joint, Front_Hoof-attach_to_ground-, Rear_Hip_Joint, Rear_Hip-attach-to-ground-, Sternum-behind_leg-, Belly-Lowest-Part` |
| `17_side` | A + F |
| `18_side` | A + F |
| `19_side` | A with `Ear_Tip-head-reference-` replacing its third name, followed by R |
| `20_side` | A + R |
| `23_side` | A + F |
| `27_side` | B + R |
| `28_side` | B + R |
| `29_side` | B + R |
| `31_side` | `Tail_Base, Loin-before_or_around_hips-, Mid_Point_Peak, Withers-between_neck_shoulder_starts-, Ear_Tip, Eye, Snout_Tip.` followed by F |
| `34_side` | B + R |
| `35_side` | B + R |
| `36_side` | B + R |
| `38_side` | B + R |

No numeric skeleton IDs or machine-readable edges were exposed by these dialogs. The first top template visually connected the named torso/head outline and spine, but a complete authoritative edge list was not reconstructed from pixels. Symmetry controls were not changed.

### Three source annotations versus local exported coordinates

Used Dataset filename search and each image's Raw Data read view, selecting only the rendered Annotation Data JSON for comparison; unrelated source metadata/personnel were not retained. These three current original annotations are all 4032x3024. Their numeric point arrays transform to the existing 640x640 black-letterboxed local labels as `x_normalized = x_source / 4032`, `y_normalized = (y_source + 504) / 4032`.

For each of all 13 points in each sample, compared both coordinates in source-array position order to corresponding local YOLO slot. Maximum absolute normalized-coordinate residual for **each sample**: `1.1102230246251565e-16` (floating-point rounding). No dataset files were modified. This proves exact positional correspondence for these samples, not all images/classes or name stability through version creation.

| Sample/current source link | Class | Source numeric point IDs in array order | Local export slots |
|---|---|---|---|
| [IMG_1556](https://app.roboflow.com/maria-antonette-efren/pigweight_side-znzvb/images/OsWrDOiYk4OgBZI7KW3G) | `18_side` | `0,1,2,3,4,5,6,7,8,9,10,11,12` | Positions `0..12`, same coordinates after transform |
| [IMG_1865](https://app.roboflow.com/maria-antonette-efren/pigweight_side-znzvb/images/rnA0NetE6A0sSL4E79Zi) | `16_side` | `0,13,14,18,22,23,24,29,30,31,32,33,35` | Positions `0..12`, same coordinates after transform |
| [IMG_3517](https://app.roboflow.com/maria-antonette-efren/pigweight_side-znzvb/images/9reFUepcneAA7ppTWUlZ) | `38_side` | `0,1,2,3,4,5,6,7,8,9,10,11,12` | Positions `0..12`, same coordinates after transform |

The noncontiguous class-16 source IDs are particularly important: local slot 10 corresponds to source ID 32 in this sample, not source ID 10. A class-independent numeric-guide interpretation loses this distinction. The class-specific current name sequences are consistent with the observed broad placement differences; they do not certify that belly/sternum landmarks were anatomically placed correctly.

## Concrete conversion proposal for review, not execution

Keep originals/version-1 export immutable. Before class collapse, derive a canonical per-view schema using original class and point-ID/name evidence; retain a provenance manifest including original weight class, source image/annotation identifiers, source point IDs, mapping version and split/animal/session information. Use a separate prepared dataset. Review spelling aliases individually; `tail-tip`, `tail`, and `tail-base` are not automatically interchangeable. Validate actual named landmark placement across classes/orientations, not just names/order. No remote schema edits or local remapping is authorized by this proposal.

For review only, if current names are confirmed to match original IDs and actual anatomy, the following side candidates would target the supplied guide's order. Each list means `canonical output slot -> existing local input slot`. These are **not accepted transforms**:

| Class | Candidate local-slot permutation | Source IDs in proposed canonical order for inspected sample |
|---|---|---|
| `16_side` | `[0,1,2,3,6,4,5,7,8,9,10,11,12]` | `[0,13,14,18,24,22,23,29,30,31,32,33,35]` |
| `18_side` | `[0,1,2,3,4,5,6,7,8,11,12,10,9]` | `[0,1,2,3,4,5,6,7,8,11,12,10,9]` |
| `38_side` | `[0,1,2,3,4,5,6,11,12,7,8,9,10]` | `[0,1,2,3,4,5,6,11,12,7,8,9,10]` |

Coverage: current names read for all 30 classes; direct original-to-export coordinate correspondence checked only for these three side examples; no top coordinate crosswalk, exhaustive per-class raw-ID mapping, frozen named metadata, or full anatomical-placement audit. Do not extrapolate the three candidates to other classes. User/annotation-author visual review is required before any application. Keep training on hold until the reviewed dataset has one consistent per-view schema and verified flip semantics. The current browser evidence makes a reversible, reviewed preparation pass a concrete option; it does not justify immediate training or weight/calibration claims.
