/**
 * AI 推理 worker：抠图 / 放大都在这里跑，主线程只负责收发消息。
 * ORT 会话在这个 worker 里缓存，同一模型连续处理不会重复加载。
 */

import type { AiProgress, AiRequest, AiResponse } from "./ai-shared";
import { removeBackground } from "./matting";
import { upscaleImage } from "./upscale";

function post(response: AiResponse) {
  globalThis.postMessage(response);
}

async function handle(request: AiRequest): Promise<Blob> {
  const onProgress = (progress: AiProgress) =>
    post({ id: request.id, kind: "progress", progress });

  if (request.kind === "matting") {
    return removeBackground(request.blob, request.model, onProgress);
  }
  return upscaleImage(request.blob, request.scale, onProgress);
}

globalThis.addEventListener(
  "message",
  async (event: MessageEvent<AiRequest>) => {
    const request = event.data;
    try {
      const blob = await handle(request);
      post({ id: request.id, kind: "done", blob });
    } catch (error) {
      post({
        id: request.id,
        kind: "error",
        // TOO_LARGE 这类约定好的 message 要原样带回，视图靠它区分提示文案
        message: error instanceof Error ? error.message : String(error),
      });
    }
  },
);
