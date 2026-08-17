/**
 * AI 推理运行时（只在 WorkerAi 里用，别从主线程 import）：
 * - ORT 运行时按设备选择：支持 WebGPU 就走 GPU，否则纯 wasm
 * - 模型文件用 Cache API 持久缓存，带下载进度
 * - 会话按模型缓存，加载失败不留死缓存，可重试
 */

import { MODEL_CACHE, webGpuAvailable, type AiProgress } from "./ai-shared";

export type { AiProgress };

export type OrtSession = {
  ort: typeof import("onnxruntime-web/wasm");
  session: import("onnxruntime-web").InferenceSession;
  backend: "webgpu" | "wasm";
};

/** 真实检测：不仅要有 API，还得拿得到 GPU 适配器 */
async function hasWebGpuAdapter(): Promise<boolean> {
  if (!webGpuAvailable()) return false;
  try {
    const gpu = (navigator as { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
    return Boolean(await gpu?.requestAdapter());
  } catch {
    return false;
  }
}

type ModelProgress = (loaded: number, total: number) => void;

async function fetchModel(
  url: string,
  onProgress?: ModelProgress,
): Promise<ArrayBuffer> {
  try {
    const cache = await caches.open(MODEL_CACHE);
    const cached = await cache.match(url);
    if (cached) {
      const buffer = await cached.arrayBuffer();
      onProgress?.(buffer.byteLength, buffer.byteLength);
      return buffer;
    }
  } catch {}

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch model: HTTP ${response.status}`);
  }
  const total = Number(response.headers.get("content-length")) || 0;
  let buffer: ArrayBuffer;
  if (!response.body || !total) {
    buffer = await response.arrayBuffer();
    onProgress?.(buffer.byteLength, buffer.byteLength);
  } else {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.byteLength;
      onProgress?.(loaded, total);
    }
    const bytes = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    buffer = bytes.buffer;
  }
  try {
    const cache = await caches.open(MODEL_CACHE);
    await cache.put(url, new Response(buffer.slice(0)));
  } catch {}
  return buffer;
}

async function loadOrt() {
  if (await hasWebGpuAdapter()) {
    const ort = await import("onnxruntime-web/webgpu");
    ort.env.wasm.wasmPaths = "/ort/";
    ort.env.wasm.numThreads = 1;
    return { ort, eps: ["webgpu", "wasm"], backend: "webgpu" as const };
  }
  const ort = await import("onnxruntime-web/wasm");
  ort.env.wasm.wasmPaths = "/ort/";
  ort.env.wasm.numThreads = 1;
  return { ort, eps: ["wasm"], backend: "wasm" as const };
}

// Lazy with retry: a failed load must not be cached forever.
const sessions = new Map<string, Promise<OrtSession>>();

/**
 * 带降级的推理：WebGPU 后端在个别模型/算子上会翻车（创建成功、
 * 运行才报错），一旦失败就地重建 wasm 会话并重跑，之后一直用 wasm。
 */
export async function runSession(
  handle: OrtSession,
  modelUrl: string,
  feeds: Record<string, import("onnxruntime-web").Tensor>,
) {
  try {
    return await handle.session.run(feeds);
  } catch (error) {
    if (handle.backend !== "webgpu") throw error;
    console.warn("[Az-im] WebGPU run failed, falling back to wasm:", error);
    const model = await fetchModel(modelUrl);
    const session = await handle.ort.InferenceSession.create(model, {
      executionProviders: ["wasm"],
    });
    handle.session = session;
    handle.backend = "wasm";
    return handle.session.run(feeds);
  }
}

export function getSession(
  modelUrl: string,
  onProgress?: (progress: AiProgress) => void,
): Promise<OrtSession> {
  let pending = sessions.get(modelUrl);
  if (!pending) {
    pending = (async (): Promise<OrtSession> => {
      const model = await fetchModel(modelUrl, (loaded, total) =>
        onProgress?.({
          stage: "model",
          percent: total ? Math.min(100, Math.round((loaded * 100) / total)) : 0,
          loaded,
          total,
        }),
      );
      const { ort, eps, backend } = await loadOrt();
      try {
        const session = await ort.InferenceSession.create(model, {
          executionProviders: eps as ["wasm"],
        });
        return { ort, session, backend };
      } catch (error) {
        // WebGPU 后端翻车就退回纯 wasm，别让整个功能失效
        if (backend === "webgpu") {
          console.warn("[Az-im] WebGPU backend failed, falling back to wasm:", error);
          const session = await ort.InferenceSession.create(model, {
            executionProviders: ["wasm"],
          });
          return { ort, session, backend: "wasm" };
        }
        throw error;
      }
    })().catch((error) => {
      sessions.delete(modelUrl);
      throw error;
    });
    sessions.set(modelUrl, pending);
  }
  return pending;
}
