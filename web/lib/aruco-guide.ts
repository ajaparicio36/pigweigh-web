type Marker = { id: number; corners: { x: number; y: number }[] };
type ArucoLibrary = {
  DICTIONARIES: Record<string, { nBits: number; tau: number; codeList: number[][] }>;
  Detector: new (options: { dictionaryName: string; maxHammingDistance: number }) => {
    detect(image: ImageData): Marker[];
  };
};

const dictionaryName = "PIGWEIGH_4X4_ID0";
let library: Promise<ArucoLibrary> | undefined;

function loadScript(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `/vendor/js-aruco2/${name}.js`;
    script.onload = () => resolve();
    script.onerror = () => { script.remove(); reject(new Error("Could not load the marker detector.")); };
    document.head.append(script);
  });
}

export async function createGuideDetector() {
  library ??= (async () => {
    await loadScript("cv");
    await loadScript("aruco");
    const aruco = (window as Window & { AR?: ArucoLibrary }).AR;
    if (!aruco?.Detector) throw new Error("The marker detector is unavailable.");
    // OpenCV DICT_4X4_50 marker 0, in dictionary byte order.
    aruco.DICTIONARIES[dictionaryName] = { nBits: 16, tau: 1, codeList: [[181, 50]] };
    return aruco;
  })().catch((error: unknown) => {
    library = undefined;
    throw error;
  });
  const aruco = await library;
  const detector = new aruco.Detector({ dictionaryName, maxHammingDistance: 0 });

  return (context: CanvasRenderingContext2D, guide: readonly number[]): boolean => {
    const { width, height } = context.canvas;
    const [left, top, right, bottom] = [guide[0] * width, guide[1] * height, guide[2] * width, guide[3] * height];
    const side = Math.min(right - left, bottom - top);
    if (!(side > 0)) return false;
    const padding = side * 0.35;
    const x = Math.max(0, Math.floor(left - padding));
    const y = Math.max(0, Math.floor(top - padding));
    const endX = Math.min(width, Math.ceil(right + padding));
    const endY = Math.min(height, Math.ceil(bottom + padding));
    if (endX <= x || endY <= y) return false;

    const markers = detector.detect(context.getImageData(x, y, endX - x, endY - y));
    if (markers.length !== 1 || markers[0].id !== 0 || markers[0].corners.length !== 4) return false;
    const target = [[left, top], [right, top], [right, bottom], [left, bottom]];
    return target.some((_, rotation) => target.every(([tx, ty], index) => {
      const corner = markers[0].corners[(index + rotation) % 4];
      return Math.hypot(corner.x + x - tx, corner.y + y - ty) <= side * 0.06;
    }));
  };
}
