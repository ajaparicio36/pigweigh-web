from io import BytesIO
import json
from pathlib import Path
from types import SimpleNamespace

from fastapi.testclient import TestClient
import numpy as np
from PIL import Image
import pytest

from pigweigh.config import Settings, database_url
from pigweigh.inference import (CaptureRejected, InferenceEngine, InferenceUnavailable, METHOD,
    SIDE_POINTS, TOP_POINTS, decimal_measure, homography_from_corners, letterbox, marker_homography,
    measure, project_points, required_pose, sha256_file)


def marker_pixels(marker_id=0):
    import cv2
    pixels = np.full((500,500,3),255,dtype=np.uint8)
    marker = cv2.aruco.generateImageMarker(cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50),marker_id,100)
    pixels[50:150,50:150] = marker[:,:,None]
    return pixels


def output(view):
    names = TOP_POINTS if view == "top" else SIDE_POINTS
    result = np.zeros((1,300,6+3*len(names)),dtype=np.float32)
    result[0,0,:6] = [120*1.28,50*1.28,450*1.28,450*1.28,0.9,0]
    points = {"left-ear-base":(200,100), "right-ear-base":(220,100), "tail-base":(210,400),
              "left-chest":(150,200), "right-chest":(250,200)} if view == "top" else {"withers":(300,100), "sternum":(300,300)}
    for name, (x,y) in points.items():
        index = 6 + 3*names.index(name)
        result[0,0,index:index+3] = [x*1.28,y*1.28,0.9]
    return result


@pytest.fixture
def fake_bundle(tmp_path, monkeypatch):
    models = {}
    for view, names in (("top", TOP_POINTS),("side",SIDE_POINTS)):
        path = tmp_path / f"{view}.onnx"
        path.write_bytes(f"test-model-{view}".encode())
        models[view] = {"file":path.name, "sha256":sha256_file(path), "keypoints":list(names),
                        "input_size":640, "input_shape":[1,3,640,640], "output_shape":[1,300,6+3*len(names)], "end2end":True}
    manifest = {"schema_version":1,"bundle_id":"test-bundle","method":METHOD,"formula_divisor":11900,
                "marker":{"dictionary":"DICT_4X4_50","id":0,"side_mm":100},"models":models}
    path = tmp_path / "manifest.json"
    path.write_text(json.dumps(manifest))
    class FakeSession:
        def __init__(self, filename, **kwargs):
            self.view = Path(filename).stem
        def get_inputs(self):
            return [SimpleNamespace(name="images",shape=[1,3,640,640],type="tensor(float)")]
        def get_outputs(self):
            return [SimpleNamespace(shape=list(output(self.view).shape))]
        def get_modelmeta(self):
            names=TOP_POINTS if self.view=="top" else SIDE_POINTS
            return SimpleNamespace(custom_metadata_map={"task":"pose", "names":"{0: 'pig'}",
                "kpt_shape":repr([len(names),3]), "kpt_names":repr({0:list(names)}), "end2end":"True"})
        def run(self, outputs, inputs):
            return [output(self.view)]
    monkeypatch.setattr("pigweigh.inference.ort.InferenceSession",FakeSession)
    return path, manifest


def test_projection_measurement_scale_and_physical_midpoint():
    h = homography_from_corners(np.array([[50.,50.],[150,50],[150,150],[50,150]]),(500,500,3),"top")
    points = project_points({"a":np.array([100.,100.]),"b":np.array([200.,100.])},h,"top")
    assert np.linalg.norm(points["a"]-points["b"]) == pytest.approx(10)
    values = measure({"left-ear-base":np.array([0.,0.]),"right-ear-base":np.array([2.,0.]),
                      "tail-base":np.array([1.,30.]),"left-chest":np.array([-4.,10.]),"right-chest":np.array([6.,10.])},
                     {"withers":np.array([0.,0.]),"sternum":np.array([0.,20.])})
    assert values["body_length_cm"] == pytest.approx(30)
    assert values["chest_width_cm"] == pytest.approx(10)
    assert values["chest_depth_cm"] == pytest.approx(20)
    assert values["weight_kg"] == pytest.approx(values["girth_cm"]**2 * 30 /11900)


def test_marker_detection_and_ambiguity():
    h = marker_homography(marker_pixels(),"top")
    assert np.isfinite(h).all()
    with pytest.raises(CaptureRejected,match="Show the complete"):
        marker_homography(np.full((500,500,3),255,dtype=np.uint8),"top")
    with pytest.raises(CaptureRejected,match="Show only one"):
        marker_homography(marker_pixels(1),"side")
    double = marker_pixels()
    double[250:350,250:350] = marker_pixels()[50:150,50:150]
    with pytest.raises(CaptureRejected,match="Show only one"):
        marker_homography(double,"side")


def test_degenerate_and_horizon_projection_rejected():
    with pytest.raises(CaptureRejected):
        homography_from_corners(np.zeros((4,2)),(500,500,3),"top")
    with pytest.raises(CaptureRejected):
        homography_from_corners(np.array([[-1,0],[100,0],[100,100],[0,100]]),(500,500,3),"top")
    h = np.array([[1.,0,0],[0,1,0],[1,0,-2.]])
    for x in (2.,1.):
        with pytest.raises(CaptureRejected):
            project_points({"bad":np.array([x,3.])},h,"top")


def test_letterbox_inverse_non_square_and_thin_boundary():
    image = np.zeros((403,700,3),dtype=np.uint8)
    tensor, scale, left, top = letterbox(image)
    assert tensor.shape == (1,3,640,640) and tensor.dtype == np.float32
    raw = output("top")
    for index in range(len(TOP_POINTS)):
        raw[0,0,6+3*index:8+3*index] = [123*scale+left,234*scale+top]
        raw[0,0,8+3*index] = .9
    point = required_pose(raw,image.shape,TOP_POINTS,("tail-base",),scale,left,top,"top")["tail-base"]
    assert point == pytest.approx([123,234])
    with pytest.raises(ValueError,match="aspect ratio"):
        letterbox(np.zeros((100000,1,3),dtype=np.uint8))


def test_horizon_branch_is_relative_to_marker_not_matrix_normalization():
    corners=np.array([[100.,100.],[200,100],[300,200],[0,200]])
    transform=homography_from_corners(corners,(500,500,3),"top")
    same=project_points({"point":np.array([150.,150.])},transform,"top")["point"]
    assert same==pytest.approx([5,7.5])
    with pytest.raises(CaptureRejected):
        project_points({"point":np.array([150.,20.])},transform,"top")


@pytest.mark.parametrize("case",["none","multiple","confidence","outside","nonfinite"])
def test_pose_failures(case):
    data = output("top")
    index=6+3*TOP_POINTS.index("tail-base")
    if case=="none": data[0,0,4]=0
    elif case=="multiple": data[0,1]=data[0,0]
    elif case=="confidence": data[0,0,index+2]=.49
    elif case=="outside": data[0,0,index]=10000
    else: data[0,0,index]=np.nan
    with pytest.raises(CaptureRejected):
        required_pose(data,(500,500,3),TOP_POINTS,("tail-base",),1.28,0,0,"top")


def test_model_validation_and_success(fake_bundle):
    path,_=fake_bundle
    runtime=InferenceEngine(path);runtime.load()
    assert runtime.readiness()=={"ready":True,"blockers":[]}
    with Image.fromarray(marker_pixels()) as top,Image.fromarray(marker_pixels()) as side:
        result=runtime.estimate({"top":top,"side":side})
    assert result["method"]["version"]==METHOD and result["method"]["accuracy_evaluated"] is False
    assert float(result["estimated_weight_kg"])>0
    assert set(result["measurements"])=={"body_length_cm","chest_width_cm","chest_depth_cm","girth_cm"}
    assert all(value.count(".")==1 and len(value.split(".")[1])==2 for value in result["measurements"].values())


@pytest.mark.parametrize("case",["checksum","keypoints","marker","shape","escape"])
def test_bad_manifest_is_unavailable_without_private_paths(fake_bundle,case):
    path,manifest=fake_bundle
    if case=="checksum": manifest["models"]["top"]["sha256"]="0"*64
    elif case=="keypoints": manifest["models"]["top"]["keypoints"]=list(reversed(TOP_POINTS))
    elif case=="marker":manifest["marker"]["side_mm"]=10
    elif case=="shape":manifest["models"]["top"]["output_shape"]=[1,300,38]
    else:manifest["models"]["top"]["file"]="../outside.onnx"
    path.write_text(json.dumps(manifest))
    runtime=InferenceEngine(path);runtime.load()
    assert runtime.readiness()["ready"] is False
    assert str(path) not in json.dumps(runtime.readiness())
    with pytest.raises(InferenceUnavailable):runtime.estimate({})


def test_reporting_underflow_and_finite_large_values():
    with pytest.raises(ValueError):decimal_measure(.0001)
    assert decimal_measure(1.005)=="1.01"
    assert decimal_measure(1e100).endswith(".00")


def test_runtime_failure_disables_readiness_until_restart(fake_bundle,monkeypatch):
    path,_=fake_bundle
    runtime=InferenceEngine(path);runtime.load()
    def fail(*args,**kwargs):raise RuntimeError("private runtime diagnostic")
    monkeypatch.setattr(runtime.models["top"].session,"run",fail)
    with Image.fromarray(marker_pixels()) as top,Image.fromarray(marker_pixels()) as side:
        with pytest.raises(InferenceUnavailable):runtime.estimate({"top":top,"side":side})
    assert runtime.readiness()["ready"] is False
    assert runtime.readiness()["blockers"][0]["code"]=="inference_runtime_failed"
    assert "private runtime diagnostic" not in json.dumps(runtime.readiness())


def test_onnx_metadata_end2end_must_match_manifest(fake_bundle,monkeypatch):
    from pigweigh import inference
    path,_=fake_bundle
    session_type=inference.ort.InferenceSession
    class DifferentMetadata(session_type):
        def get_modelmeta(self):
            result=super().get_modelmeta()
            result.custom_metadata_map["end2end"]="False"
            return result
    monkeypatch.setattr(inference.ort,"InferenceSession",DifferentMetadata)
    runtime=InferenceEngine(path);runtime.load()
    assert runtime.readiness()["ready"] is False


def test_thin_decodable_photo_returns_actionable_422(fake_bundle):
    path,_=fake_bundle
    app=create_app_for_test(path)
    output=BytesIO()
    with Image.new("RGB",(1,100000),"white") as image:image.save(output,format="PNG")
    with TestClient(app) as client:
        response=client.post("/api/estimates",headers={"Origin":"http://localhost:3000"},files={
            "top_image":("thin.png",output.getvalue()),"side_image":("side.png",output.getvalue())})
        assert response.status_code==422
        assert response.json()["error"]["code"]=="image_aspect_unusable"


def test_api_busy_and_rejection_closes_images(fake_bundle,monkeypatch):
    path,_=fake_bundle
    app=create_app_for_test(path)
    buffer=BytesIO()
    with Image.fromarray(marker_pixels()) as image:image.save(buffer,format="PNG")
    files={"top_image":("top.png",buffer.getvalue()),"side_image":("side.png",buffer.getvalue())}
    closed=[]
    original=Image.Image.close
    def close(image):
        closed.append(id(image));original(image)
    monkeypatch.setattr(Image.Image,"close",close)
    with TestClient(app) as client:
        assert client.get("/api/inference/readiness").json()["ready"] is True
        app.state.inference_slot._value=0
        response=client.post("/api/estimates",headers={"Origin":"http://localhost:3000"},files=files)
        assert response.status_code==429 and response.json()["error"]["code"]=="inference_busy"
        app.state.inference_slot._value=1
        def reject(images):raise CaptureRejected("test_rejection","Retake this view.","side")
        monkeypatch.setattr(app.state.inference,"estimate",reject)
        response=client.post("/api/estimates",headers={"Origin":"http://localhost:3000"},files=files)
        assert response.status_code==422 and response.json()["error"]["details"]=={"view":"side"}
        assert not app.state.inference_slot.locked() and len(closed)>=2


def create_app_for_test(path):
    from pigweigh.main import create_app
    return create_app(Settings(database_url("postgresql://unused@127.0.0.1:1/unused"),"http://localhost:3000",path))


def test_cancelled_request_keeps_slot_and_images_until_worker_finishes(monkeypatch):
    import asyncio
    import threading
    import httpx
    from starlette.requests import Request
    from pigweigh.main import APIError
    app=create_app_for_test(None)
    endpoint=next(route.endpoint for route in app.routes if route.path=="/api/estimates")
    entered,release=threading.Event(),threading.Event()
    owned=[]
    def blocked_worker(images):
        owned.extend(images.values())
        entered.set()
        assert release.wait(timeout=5)
        for image in owned: image.getpixel((0,0))
        return {"estimated_weight_kg":"1.00"}
    monkeypatch.setattr(app.state.inference,"estimate",blocked_worker)
    png=BytesIO()
    with Image.new("RGB",(8,8),"red") as image:image.save(png,format="PNG")
    encoded=httpx.Request("POST","http://localhost/api/estimates",files={
        "top_image":("top.png",png.getvalue()),"side_image":("side.png",png.getvalue())})
    body=encoded.read()
    def request():
        async def receive():return {"type":"http.request","body":body,"more_body":False}
        return Request({"type":"http","method":"POST","path":"/api/estimates",
                        "headers":[(key.lower(),value) for key,value in encoded.headers.raw]},receive)
    async def exercise():
        task=asyncio.create_task(endpoint(request()))
        try:
            for _ in range(200):
                if entered.is_set():break
                await asyncio.sleep(.01)
            assert entered.is_set()
            task.cancel()
            await asyncio.sleep(.02)
            task.cancel()  # A second cancellation must not bypass the join.
            await asyncio.sleep(.02)
            assert not task.done() and app.state.inference_slot.locked()
            for image in owned:image.getpixel((0,0))
            with pytest.raises(APIError) as busy:
                await endpoint(request())
            assert busy.value.status==429 and busy.value.code=="inference_busy"
        finally:
            release.set()
            with pytest.raises(asyncio.CancelledError):await task
        assert not app.state.inference_slot.locked()
        for image in owned:
            with pytest.raises(ValueError):image.getpixel((0,0))
    asyncio.run(exercise())
    app.state.engine.dispose()
