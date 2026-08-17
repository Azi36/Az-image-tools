/**
 * 浏览器本地背景移除引擎（跑在 WorkerAi 里）
 * 双模型可选：U2-Netp（快）/ Silueta（好，U2-Net 压缩版），都是 Apache-2.0。
 * 图片全程不离开浏览器。
 */

import { getSession, runSession } from "./ai";
import {
  MATTING_MODELS,
  type AiProgress,
  type MattingModelKey,
} from "./ai-shared";

/**
 * 移除图片背景，返回带透明通道的 PNG Blob
 */
export async function removeBackground(
  blob: Blob,
  modelKey: MattingModelKey,
  onProgress?: (progress: AiProgress) => void,
): Promise<Blob> {
  const model = MATTING_MODELS.find((item) => item.key === modelKey) ?? MATTING_MODELS[0];
  const handle = await getSession(model.url, onProgress);
  const { ort } = handle;
  onProgress?.({ stage: "run" });

  const bitmap = await createImageBitmap(blob);
  const { width, height } = bitmap;
  const size = model.inputSize;

  // 预处理：缩放到模型输入尺寸，按模型归一化，NCHW 排布
  const inputCanvas = new OffscreenCanvas(size, size);
  const inputContext = inputCanvas.getContext("2d")!;
  inputContext.drawImage(bitmap, 0, 0, size, size);
  const { data } = inputContext.getImageData(0, 0, size, size);
  const area = size * size;
  const input = new Float32Array(3 * area);
  if (model.norm === "imagenet") {
    for (let i = 0; i < area; i++) {
      input[i] = (data[i * 4] / 255 - 0.485) / 0.229;
      input[area + i] = (data[i * 4 + 1] / 255 - 0.456) / 0.224;
      input[2 * area + i] = (data[i * 4 + 2] / 255 - 0.406) / 0.225;
    }
  } else {
    // ISNet：x/255 - 0.5
    for (let i = 0; i < area; i++) {
      input[i] = data[i * 4] / 255 - 0.5;
      input[area + i] = data[i * 4 + 1] / 255 - 0.5;
      input[2 * area + i] = data[i * 4 + 2] / 255 - 0.5;
    }
  }

  const tensor = new ort.Tensor("float32", input, [1, 3, size, size]);
  const results = await runSession(handle, model.url, { [handle.session.inputNames[0]]: tensor });
  const mask = results[handle.session.outputNames[0]].data as Float32Array;

  // 蒙版 min-max 归一化后写成 alpha
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < area; i++) {
    if (mask[i] < min) min = mask[i];
    if (mask[i] > max) max = mask[i];
  }
  const range = max - min || 1;
  const maskCanvas = new OffscreenCanvas(size, size);
  const maskContext = maskCanvas.getContext("2d")!;
  const maskImage = maskContext.createImageData(size, size);
  for (let i = 0; i < area; i++) {
    const alpha = Math.round(((mask[i] - min) / range) * 255);
    maskImage.data[i * 4] = 255;
    maskImage.data[i * 4 + 1] = 255;
    maskImage.data[i * 4 + 2] = 255;
    maskImage.data[i * 4 + 3] = alpha;
  }
  maskContext.putImageData(maskImage, 0, 0);

  // 原图 + destination-in 蒙版 = 透明背景
  const output = new OffscreenCanvas(width, height);
  const outputContext = output.getContext("2d")!;
  outputContext.drawImage(bitmap, 0, 0);
  outputContext.globalCompositeOperation = "destination-in";
  outputContext.imageSmoothingEnabled = true;
  outputContext.imageSmoothingQuality = "high";
  outputContext.drawImage(maskCanvas, 0, 0, width, height);
  bitmap.close();

  return output.convertToBlob({ type: "image/png" });
}
