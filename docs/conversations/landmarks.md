Here are the exact landmark definitions and 0-indexed anatomical naming maps for both skeletons, taken directly from the project's original annotation guide:

### **Top-Down View (pig\_top) — 11 Keypoints (Indices 0–10)**

For top-down YOLO pose exports, each line maps to the following keypoint order:

| Index | Keypoint Name | Anatomical Landmark / Definition | Purpose in Math Pipeline |
| :---- | :---- | :---- | :---- |
| **0** | snout\_tip | Frontmost tip of the snout | Anterior anchor for body length (L) |
| **1** | left\_ear\_base | Base of the left ear where it joins the skull | Head orientation and symmetrical width |
| **2** | right\_ear\_base | Base of the right ear where it joins the skull | Symmetrical pair with index 1 |
| **3** | left\_shoulder | Lateral border of the left cranial shoulder blade | Shoulder width measurement |
| **4** | right\_shoulder | Lateral border of the right cranial shoulder blade | Symmetrical pair with index 3 |
| **5** | left\_chest | Widest thoracic point on left ribcage (behind shoulder) | Heart girth width (W\_{\\text{chest}}) |
| **6** | right\_chest | Widest thoracic point on right ribcage (behind shoulder) | Symmetrical pair with index 5 |
| **7** | left\_hip | Lateral prominence of the left pelvis / hip bone | Hip width measurement |
| **8** | right\_hip | Lateral prominence of the right pelvis / hip bone | Symmetrical pair with index 7 |
| **9** | tail\_base | Dorsal insertion of the tail into the rump | Posterior anchor for body length (L) |
| **10** | spine\_mid | Midpoint along dorsal vertebral column between shoulders and hips | Quality check for lateral curvature/bent posture |

**Dataset YAML entry for top view:**  
`kpt_shape: [11, 3] # [x, y, visibility]`  
`flip_idx: [0, 2, 1, 4, 3, 6, 5, 8, 7, 9, 10]`  
`names:`  
  `0: pig`

### **Side View (pig\_side) — 13 Keypoints (Indices 0–12)**

For side-view YOLO pose exports, each line maps to the following keypoint order:

| Index | Keypoint Name | Anatomical Landmark / Definition | Purpose in Math Pipeline |
| :---- | :---- | :---- | :---- |
| **0** | snout\_tip | Anterior point of the snout profile | Side body length anchor |
| **1** | eye | Visible lateral eye | Head size proxy |
| **2** | ear\_tip | Apex/tip of the visible ear | Head reference landmark |
| **3** | withers | Highest dorsal point at the base of neck / top of shoulders | Top anchor for withers height & chest depth |
| **4** | mid\_back\_peak | Highest curve along the dorsal spine | Back line curvature tracking |
| **5** | loin\_rump\_top | Dorsal transition line before/around the pelvic crest | Back-to-hip slope evaluation |
| **6** | tail\_base | Posterior base of the tail attachment | Body length posterior anchor |
| **7** | front\_shoulder\_joint | Center of the cranial shoulder joint | Front leg attachment point |
| **8** | front\_hoof | Contact point of the front hoof with the floor | Withers height (kp3 \\to kp8) |
| **9** | rear\_hip\_joint | Center of the rear hip/pelvic joint | Rear leg attachment point |
| **10** | rear\_hoof | Contact point of the rear hoof with the floor | Hip height (kp9 \\to kp10) |
| **11** | sternum\_brisket | Ventral chest floor right behind the front leg | Chest depth (kp3 \\to kp11) for heart girth |
| **12** | belly\_lowest\_part | Lowest point of the ventral abdominal contour | Belly drop / body condition score proxy |

**Dataset YAML entry for side view:**  
`kpt_shape: [13, 3] # [x, y, visibility]`  
`# Keep sequential (no left/right swapping unless near/far legs are labeled identically)`  
`flip_idx: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]`  
`names:`  
  `0: pig`  
