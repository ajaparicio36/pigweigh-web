"""Configured CPU pose + per-photo marker-plane measurements for the thesis prototype."""
from dataclasses import dataclass
import ast
from decimal import Decimal, ROUND_HALF_UP, localcontext
import hashlib
import json
from pathlib import Path
import re

import cv2
import numpy as np
import onnxruntime as ort
from PIL import Image

from pigweigh.formula import ellipse_girth_cm, estimate_weight_kg

METHOD = "attached-marker-ellipse-11900-v1"
TOP_POINTS = ("snout-tip", "left-ear-base", "right-ear-base", "left-shoulder", "right-shoulder",
              "left-chest", "right-chest", "left-hip", "right-hip", "tail-base", "spine-midpoint")
SIDE_POINTS = ("snout-tip", "eye", "ear-tip", "withers", "mid-point-peak", "loin", "tail-base",
               "front-shoulder-joint", "front-hoof", "rear-hip-joint", "rear-hoof", "sternum", "belly-lowest-part")
PIG_THRESHOLD = 0.5
KEYPOINT_THRESHOLD = 0.5
INPUT_SIZE = 640
cv2.setNumThreads(2)


class CaptureRejected(Exception):
    def __init__(self, code: str, message: str, view: str):
        self.code, self.message, self.view = code, message, view


class InferenceUnavailable(Exception):
    pass


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def letterbox(image: np.ndarray) -> tuple[np.ndarray, float, int, int]:
    height, width = image.shape[:2]
    scale = min(INPUT_SIZE / height, INPUT_SIZE / width)
    resized_width, resized_height = round(width * scale), round(height * scale)
    if resized_width < 1 or resized_height < 1:
        raise ValueError("The image aspect ratio cannot be represented at the model input size")
    left = round((INPUT_SIZE - resized_width) / 2 - 0.1)
    top = round((INPUT_SIZE - resized_height) / 2 - 0.1)
    resized = cv2.resize(image, (resized_width, resized_height), interpolation=cv2.INTER_LINEAR)
    padded = cv2.copyMakeBorder(resized, top, INPUT_SIZE - resized_height - top,
                               left, INPUT_SIZE - resized_width - left, cv2.BORDER_CONSTANT, value=(114,114,114))
    tensor = np.ascontiguousarray(padded.transpose(2,0,1)[None], dtype=np.float32) / 255.0
    return tensor, scale, left, top


def required_pose(output: np.ndarray, image_shape: tuple[int, ...], names: tuple[str, ...],
                  required: tuple[str, ...], scale: float, left: int, top: int, view: str) -> dict[str, np.ndarray]:
    rows = output[0]
    if not np.isfinite(rows).all():
        raise CaptureRejected("invalid_pose", "The pose model did not produce finite landmarks. Retake this view.", view)
    detections = rows[rows[:,4] >= PIG_THRESHOLD]
    if len(detections) != 1:
        raise CaptureRejected("pig_count", "Show exactly one clearly visible pig in this view.", view)
    row = detections[0]
    if row[5] != 0 or not 0 <= row[4] <= 1:
        raise CaptureRejected("invalid_pose", "The pose prediction does not match the configured pig model.", view)
    box = row[:4].astype(np.float64).copy()
    box[[0,2]] = (box[[0,2]] - left) / scale
    box[[1,3]] = (box[[1,3]] - top) / scale
    if box[2] <= box[0] or box[3] <= box[1]:
        raise CaptureRejected("invalid_pose", "The pig outline is unusable. Retake this view.", view)
    points = row[6:].reshape(len(names), 3).astype(np.float64)
    height, width = image_shape[:2]
    selected = {}
    for name in required:
        x, y, confidence = points[names.index(name)]
        if not KEYPOINT_THRESHOLD <= confidence <= 1:
            raise CaptureRejected("landmark_unusable", f"The required {name} landmark is not clear. Retake this view.", view)
        point = np.array([(x-left)/scale, (y-top)/scale], dtype=np.float64)
        if not (0 <= point[0] < width and 0 <= point[1] < height):
            raise CaptureRejected("landmark_outside_image", "A required landmark falls outside the photo. Retake this view.", view)
        selected[name] = point
    return selected


def marker_homography(image: np.ndarray, view: str) -> np.ndarray:
    detector = cv2.aruco.ArucoDetector(cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50),
                                      cv2.aruco.DetectorParameters())
    corners, ids, _ = detector.detectMarkers(cv2.cvtColor(image, cv2.COLOR_RGB2GRAY))
    if ids is None or len(ids) == 0:
        raise CaptureRejected("marker_missing", "Show the complete configured ArUco ID 0 card and its white margin.", view)
    if len(ids) != 1 or int(ids[0,0]) != 0:
        raise CaptureRejected("marker_ambiguous", "Show only one DICT_4X4_50 marker with ID 0 in this view.", view)
    return homography_from_corners(np.asarray(corners[0]).reshape(4,2), image.shape, view)


def homography_from_corners(corners: np.ndarray, image_shape: tuple[int, ...], view: str) -> np.ndarray:
    height, width = image_shape[:2]
    if (corners.shape != (4,2) or not np.isfinite(corners).all()
            or (corners[:,0] < 0).any() or (corners[:,0] >= width).any()
            or (corners[:,1] < 0).any() or (corners[:,1] >= height).any()):
        raise CaptureRejected("marker_unusable", "The marker corners are incomplete or outside the image.", view)
    contour = corners.astype(np.float32)
    edges = np.roll(corners,-1,axis=0) - corners
    if not cv2.isContourConvex(contour) or abs(cv2.contourArea(contour)) <= 1 or (np.linalg.norm(edges,axis=1) <= 1).any():
        raise CaptureRejected("marker_unusable", "The marker is too small or degenerate. Retake this view.", view)
    transform = cv2.getPerspectiveTransform(contour, np.array([[0,0],[10,0],[10,10],[0,10]], dtype=np.float32))
    if not np.isfinite(transform).all() or np.linalg.cond(transform) > 1e12:
        raise CaptureRejected("marker_unusable", "The marker projection is numerically unstable. Retake this view.", view)
    homogeneous = np.column_stack((corners,np.ones(4)))
    denominators = homogeneous @ transform[2]
    tolerance = np.finfo(np.float64).eps * max(1.,np.linalg.norm(transform[2]) * np.linalg.norm(homogeneous,axis=1).max()) * 32
    if (np.abs(denominators) <= tolerance).any() or not ((denominators > 0).all() or (denominators < 0).all()):
        raise CaptureRejected("marker_unusable", "The marker crosses a projective horizon. Retake this view.", view)
    # Matrix scale/sign is arbitrary: use the marker's branch, not the H[2,2] sign.
    if denominators[0] < 0:
        transform = -transform
    return transform


def project_points(points: dict[str, np.ndarray], transform: np.ndarray, view: str) -> dict[str, np.ndarray]:
    projected = {}
    for name, point in points.items():
        source = np.array([*point,1.0], dtype=np.float64)
        result = transform @ source
        tolerance = np.finfo(np.float64).eps * max(1.0, np.linalg.norm(transform[2]) * np.linalg.norm(source)) * 32
        if not np.isfinite(result).all() or result[2] <= tolerance:
            raise CaptureRejected("projection_unusable", "A landmark cannot be measured in the marker reference plane.", view)
        projected[name] = result[:2] / result[2]
        if not np.isfinite(projected[name]).all():
            raise CaptureRejected("projection_unusable", "The marker projection is not finite.", view)
    return projected


def measure(top: dict[str, np.ndarray], side: dict[str, np.ndarray]) -> dict[str, float]:
    ear_midpoint = (top["left-ear-base"] + top["right-ear-base"]) / 2
    length = float(np.linalg.norm(ear_midpoint - top["tail-base"]))
    width = float(np.linalg.norm(top["left-chest"] - top["right-chest"]))
    depth = float(np.linalg.norm(side["withers"] - side["sternum"]))
    girth = ellipse_girth_cm(width, depth)
    weight = estimate_weight_kg(girth, length)
    return {"body_length_cm": length, "chest_width_cm": width, "chest_depth_cm": depth,
            "girth_cm": girth, "weight_kg": weight}


def decimal_measure(value: float) -> str:
    number = Decimal(str(value))
    if not number.is_finite() or number <= 0:
        raise ValueError("Measurement must be finite and positive")
    with localcontext() as context:
        context.prec = max(64, number.adjusted() + 4)
        result = number.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if not result.is_finite() or result <= 0:
        raise ValueError("Measurement is below the supported reporting precision")
    return str(result)


@dataclass(frozen=True)
class PoseSession:
    session: ort.InferenceSession
    names: tuple[str, ...]
    output_shape: tuple[int, ...]


class InferenceEngine:
    def __init__(self, manifest_path: Path | None):
        self.manifest_path = manifest_path
        self.models: dict[str, PoseSession] = {}
        self.bundle_id = ""
        self.blocker = {"code":"model_bundle_missing", "message":"A configured pose model bundle is required."}

    def readiness(self) -> dict:
        return {"ready": bool(self.models) and self.blocker is None,
                "blockers": [] if self.blocker is None else [dict(self.blocker)]}

    def load(self) -> None:
        if self.manifest_path is None:
            return
        try:
            self._load_bundle()
        except Exception:
            self.models.clear()
            self.blocker = {"code":"model_bundle_invalid", "message":"The configured pose bundle or marker configuration could not be verified."}

    def _load_bundle(self) -> None:
        path = self.manifest_path.resolve(strict=True)
        if path.stat().st_size > 128 * 1024:
            raise ValueError("Oversized model manifest")
        manifest = json.loads(path.read_text(encoding="utf-8"))
        if (manifest.get("schema_version") != 1 or manifest.get("method") != METHOD
                or manifest.get("formula_divisor") != 11900
                or manifest.get("marker") != {"dictionary":"DICT_4X4_50", "id":0, "side_mm":100}):
            raise ValueError("Incompatible method configuration")
        bundle_id = manifest.get("bundle_id")
        if not isinstance(bundle_id, str) or not re.fullmatch(r"[A-Za-z0-9._-]{1,128}", bundle_id):
            raise ValueError("Invalid bundle ID")
        options = ort.SessionOptions()
        options.intra_op_num_threads = 2
        options.inter_op_num_threads = 1
        models = {}
        for view, names in (("top", TOP_POINTS), ("side", SIDE_POINTS)):
            spec = manifest["models"][view]
            output_shape = (1,300,6+3*len(names))
            if (spec.get("input_size") != INPUT_SIZE or spec.get("input_shape") != [1,3,640,640]
                    or spec.get("output_shape") != list(output_shape) or spec.get("end2end") is not True
                    or spec.get("keypoints") != list(names)):
                raise ValueError("Incompatible pose schema")
            relative = Path(spec["file"])
            model_path = (path.parent / relative).resolve(strict=True)
            if relative.is_absolute() or not model_path.is_relative_to(path.parent):
                raise ValueError("Model must be inside its bundle directory")
            checksum = spec.get("sha256")
            if not isinstance(checksum, str) or not re.fullmatch(r"[0-9a-f]{64}", checksum) or sha256_file(model_path) != checksum:
                raise ValueError("Model checksum mismatch")
            session = ort.InferenceSession(str(model_path), sess_options=options, providers=["CPUExecutionProvider"])
            metadata = session.get_modelmeta().custom_metadata_map
            if (metadata.get("task") != "pose" or ast.literal_eval(metadata.get("kpt_shape", "None")) != [len(names),3]
                    or ast.literal_eval(metadata.get("kpt_names", "None")) != {0:list(names)}
                    or ast.literal_eval(metadata.get("names", "None")) != {0:"pig"}
                    or ast.literal_eval(metadata.get("end2end", "False")) is not True):
                raise ValueError("ONNX landmark metadata differs from the bundle")
            inputs, outputs = session.get_inputs(), session.get_outputs()
            if (len(inputs) != 1 or inputs[0].shape != [1,3,640,640] or inputs[0].type != "tensor(float)"
                    or len(outputs) != 1 or outputs[0].shape != list(output_shape)):
                raise ValueError("Incompatible ONNX input/output")
            warmup = session.run(None, {inputs[0].name: np.zeros((1,3,640,640),dtype=np.float32)})[0]
            if warmup.shape != output_shape or not np.isfinite(warmup).all():
                raise ValueError("ONNX CPU warmup failed")
            models[view] = PoseSession(session, names, output_shape)
        self.models, self.bundle_id, self.blocker = models, bundle_id, None

    def estimate(self, images: dict[str, Image.Image]) -> dict:
        if not self.readiness()["ready"]:
            raise InferenceUnavailable()
        measured = {}
        for view in ("top", "side"):
            pixels = np.asarray(images[view])
            try:
                tensor, scale, left, top = letterbox(pixels)
            except ValueError:
                raise CaptureRejected("image_aspect_unusable", "The photo is too narrow to process. Use a normal camera photo.", view) from None
            transform = marker_homography(pixels, view)
            model = self.models[view]
            try:
                output = model.session.run(None, {model.session.get_inputs()[0].name: tensor})[0]
                if output.shape != model.output_shape:
                    raise ValueError("Runtime output changed shape")
            except Exception:
                self.blocker = {"code":"inference_runtime_failed", "message":"The configured model runtime failed. Restart after checking the artifacts."}
                raise InferenceUnavailable() from None
            required = ("left-ear-base", "right-ear-base", "tail-base", "left-chest", "right-chest") if view == "top" else ("withers", "sternum")
            points = required_pose(output, pixels.shape, model.names, required, scale, left, top, view)
            measured[view] = project_points(points, transform, view)
        try:
            values = measure(measured["top"], measured["side"])
            weight = decimal_measure(values.pop("weight_kg"))
            dimensions = {name: decimal_measure(value) for name,value in values.items()}
        except (ValueError, ArithmeticError, OverflowError):
            raise CaptureRejected("measurements_unusable", "The photo measurements cannot produce a usable formula estimate. Retake both views.", "pair") from None
        return {"status":"estimated", "estimated_weight_kg":weight,
                "measurements":dimensions, "artifacts":{"bundle_id":self.bundle_id},
                "method":{"version":METHOD, "formula":"G_cm^2 * L_cm / 11900",
                          "marker_dictionary":"DICT_4X4_50", "marker_id":0, "marker_side_mm":"100",
                          "experimental":True, "accuracy_evaluated":False}}
