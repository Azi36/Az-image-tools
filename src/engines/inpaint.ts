/**
 * 浏览器本地去水印引擎
 * OpenCV.js 的 Telea 修复算法：用户涂抹区域 → 周边像素智能填充。
 * 经典算法零模型下载（运行时约 12MB，同样本地执行），对小面积
 * 水印、logo、文字效果好；后续可升级 LaMa 类模型做大面积修复。
 */

type OpenCv = {
  Mat: new () => unknown;
  matFromImageData: (data: ImageData) => any;
  cvtColor: (src: any, dst: any, code: number) => void;
  inpaint: (src: any, mask: any, dst: any, radius: number, flags: number) => void;
  COLOR_RGBA2RGB: number;
  COLOR_RGBA2GRAY: number;
  INPAINT_TELEA: number;
};

declare global {
  interface Window {
    // 不同构建形态不一：可能是就绪对象、带 onRuntimeInitialized 的
    // 半成品，也可能是 resolve 出真身的 Promise（@techstark 构建）
    cv?: (OpenCv & { onRuntimeInitialized?: () => void }) | Promise<OpenCv>;
  }
}

function isThenable(value: unknown): value is Promise<OpenCv> {
  return Boolean(value) && typeof (value as { then?: unknown }).then === "function";
}

// Lazy with retry: script 加载失败不留死缓存
let cvReady: Promise<OpenCv> | null = null;

export function loadOpenCv(): Promise<OpenCv> {
  if (!cvReady) {
    cvReady = new Promise<OpenCv>((resolve, reject) => {
      const settle = (cv: Window["cv"]) => {
        if (!cv) {
          reject(new Error("OpenCV failed to attach"));
        } else if (isThenable(cv)) {
          cv.then((real) => {
            window.cv = real;
            resolve(real);
          }, reject);
        } else if (cv.Mat) {
          resolve(cv);
        } else {
          cv.onRuntimeInitialized = () => resolve(cv);
        }
      };
      if (window.cv) {
        settle(window.cv);
        return;
      }
      const script = document.createElement("script");
      script.src = "/opencv/opencv.js";
      script.async = true;
      script.onload = () => settle(window.cv);
      script.onerror = () => reject(new Error("Failed to load OpenCV script"));
      document.head.appendChild(script);
    }).catch((error) => {
      cvReady = null;
      throw error;
    });
  }
  return cvReady;
}

/**
 * 修复涂抹区域：image 为原图，maskCanvas 为同尺寸蒙版
 * （涂抹处不透明，其余透明），返回修复后的 PNG Blob
 */
export async function inpaintImage(
  image: CanvasImageSource & { width: number; height: number },
  maskCanvas: HTMLCanvasElement,
): Promise<Blob> {
  const cv = await loadOpenCv();
  const width = maskCanvas.width;
  const height = maskCanvas.height;

  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = width;
  sourceCanvas.height = height;
  const sourceContext = sourceCanvas.getContext("2d")!;
  sourceContext.drawImage(image, 0, 0, width, height);

  const src = cv.matFromImageData(sourceContext.getImageData(0, 0, width, height));
  const maskSrc = cv.matFromImageData(
    maskCanvas.getContext("2d")!.getImageData(0, 0, width, height),
  );
  const rgb = new cv.Mat();
  const mask = new cv.Mat();
  const dst = new cv.Mat();
  try {
    cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);
    // 蒙版取 alpha：涂过的地方 alpha>0 → 灰度非零即修复区
    const maskData = maskCanvas.getContext("2d")!.getImageData(0, 0, width, height);
    for (let i = 0; i < width * height; i++) {
      const alpha = maskData.data[i * 4 + 3];
      maskData.data[i * 4] = alpha;
      maskData.data[i * 4 + 1] = alpha;
      maskData.data[i * 4 + 2] = alpha;
      maskData.data[i * 4 + 3] = 255;
    }
    const maskGraySrc = cv.matFromImageData(maskData);
    cv.cvtColor(maskGraySrc, mask, cv.COLOR_RGBA2GRAY);
    (maskGraySrc as { delete: () => void }).delete();

    cv.inpaint(rgb, mask, dst, 4, cv.INPAINT_TELEA);

    // dst 是 RGB，转回 canvas
    const outImage = new ImageData(width, height);
    const dstData = (dst as { data: Uint8Array }).data;
    for (let i = 0; i < width * height; i++) {
      outImage.data[i * 4] = dstData[i * 3];
      outImage.data[i * 4 + 1] = dstData[i * 3 + 1];
      outImage.data[i * 4 + 2] = dstData[i * 3 + 2];
      outImage.data[i * 4 + 3] = 255;
    }
    const outCanvas = document.createElement("canvas");
    outCanvas.width = width;
    outCanvas.height = height;
    outCanvas.getContext("2d")!.putImageData(outImage, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      outCanvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))), "image/png");
    });
  } finally {
    for (const mat of [src, maskSrc, rgb, mask, dst]) {
      (mat as { delete?: () => void }).delete?.();
    }
  }
}
