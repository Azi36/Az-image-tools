/**
 * 浏览器本地图片放大引擎
 * 模型：Real-ESRGAN general-x4v3（BSD-3，约 4.7MB），固定 4 倍放大，
 * 2 倍档从 4 倍结果高质量缩回。
 *
 * 分块推理：所有块都用固定 128×128 输入（WebGPU 后端对动态形状很挑剔），
 * 相邻块重叠 8px 消块缝，图像边缘用复制填充补齐窗口。
 */

import { getSession, runSession, type AiProgress } from "./ai";

export const UPSCALE_MODEL_URL = "/models/realesr-general-x4v3.onnx";
export const MAX_UPSCALE_EDGE = 2000;

const SCALE = 4;
const WIN = 128;          // 模型输入窗口
const PAD = 16;           // 重叠带（大一点能压住平坦区的块缝）
const CORE = WIN - PAD * 2; // 每块实际产出 96px

export async function upscaleImage(
  blob: Blob,
  targetScale: 2 | 4,
  onProgress?: (progress: AiProgress) => void,
): Promise<Blob> {
  const handle = await getSession(UPSCALE_MODEL_URL, onProgress);
  const { ort } = handle;

  const bitmap = await createImageBitmap(blob);
  const { width, height } = bitmap;
  if (Math.max(width, height) > MAX_UPSCALE_EDGE) {
    bitmap.close();
    throw new Error("TOO_LARGE");
  }

  const source = new OffscreenCanvas(width, height);
  const sourceContext = source.getContext("2d")!;
  sourceContext.drawImage(bitmap, 0, 0);
  bitmap.close();

  const output = new OffscreenCanvas(width * SCALE, height * SCALE);
  const outputContext = output.getContext("2d")!;

  // 固定尺寸输入窗口 + 边缘复制填充
  const window_ = new OffscreenCanvas(WIN, WIN);
  const windowContext = window_.getContext("2d", { willReadFrequently: true })!;

  const tilesX = Math.ceil(width / CORE);
  const tilesY = Math.ceil(height / CORE);
  const totalTiles = tilesX * tilesY;
  let doneTiles = 0;
  onProgress?.({ stage: "run", percent: 0 });

  const area = WIN * WIN;
  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      const coreX = tx * CORE;
      const coreY = ty * CORE;
      // 窗口原点：优先居中带 PAD，贴边时夹进图内
      const wx = Math.max(0, Math.min(coreX - PAD, width - WIN));
      const wy = Math.max(0, Math.min(coreY - PAD, height - WIN));
      const availW = Math.min(WIN, width - wx);
      const availH = Math.min(WIN, height - wy);

      windowContext.drawImage(source, wx, wy, availW, availH, 0, 0, availW, availH);
      // 图比窗口还小：复制最后一行/列补齐，避免黑边引入伪影
      if (availW < WIN) {
        windowContext.drawImage(source, wx + availW - 1, wy, 1, availH, availW, 0, WIN - availW, availH);
      }
      if (availH < WIN) {
        windowContext.drawImage(window_, 0, availH - 1, WIN, 1, 0, availH, WIN, WIN - availH);
      }

      const { data } = windowContext.getImageData(0, 0, WIN, WIN);
      const input = new Float32Array(3 * area);
      for (let i = 0; i < area; i++) {
        input[i] = data[i * 4] / 255;
        input[area + i] = data[i * 4 + 1] / 255;
        input[2 * area + i] = data[i * 4 + 2] / 255;
      }

      const tensor = new ort.Tensor("float32", input, [1, 3, WIN, WIN]);
      const results = await runSession(handle, UPSCALE_MODEL_URL, { [handle.session.inputNames[0]]: tensor });
      const out = results[handle.session.outputNames[0]].data as Float32Array;
      const outArea = WIN * SCALE * WIN * SCALE;

      const tileImage = new ImageData(WIN * SCALE, WIN * SCALE);
      for (let i = 0; i < outArea; i++) {
        tileImage.data[i * 4] = Math.min(255, Math.max(0, Math.round(out[i] * 255)));
        tileImage.data[i * 4 + 1] = Math.min(255, Math.max(0, Math.round(out[outArea + i] * 255)));
        tileImage.data[i * 4 + 2] = Math.min(255, Math.max(0, Math.round(out[2 * outArea + i] * 255)));
        tileImage.data[i * 4 + 3] = 255;
      }

      // 只贴核心区（窗口内去掉重叠带），消块缝
      const coreWidth = Math.min(CORE, width - coreX);
      const coreHeight = Math.min(CORE, height - coreY);
      outputContext.putImageData(
        tileImage,
        wx * SCALE,
        wy * SCALE,
        (coreX - wx) * SCALE,
        (coreY - wy) * SCALE,
        coreWidth * SCALE,
        coreHeight * SCALE,
      );

      doneTiles += 1;
      onProgress?.({ stage: "run", percent: Math.round((doneTiles * 100) / totalTiles) });
      // 让出主线程，进度条和页面保持响应
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  if (targetScale === SCALE) {
    return output.convertToBlob({ type: "image/png" });
  }

  // 2x：从 4x 高质量缩回
  const half = new OffscreenCanvas(width * targetScale, height * targetScale);
  const halfContext = half.getContext("2d")!;
  halfContext.imageSmoothingEnabled = true;
  halfContext.imageSmoothingQuality = "high";
  halfContext.drawImage(output, 0, 0, half.width, half.height);
  return half.convertToBlob({ type: "image/png" });
}
