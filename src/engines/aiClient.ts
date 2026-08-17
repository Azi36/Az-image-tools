/**
 * AI 功能的主线程入口。
 *
 * 推理本身（ORT 会话、分块循环、像素搬运）全在 WorkerAi 里跑：
 * 之前这些是在页面主线程上 await 的，几十秒的放大任务会把界面
 * 卡死，进度条也跟着停。
 */

import { AI_CANCELLED } from "./ai-shared";
import type {
  AiProgress,
  AiRequest,
  AiResponse,
  AiTask,
  MattingModelKey,
} from "./ai-shared";

type Job = {
  resolve: (blob: Blob) => void;
  reject: (error: Error) => void;
  onProgress?: (progress: AiProgress) => void;
};

let worker: Worker | null = null;
const jobs = new Map<number, Job>();
let nextId = 1;

function handleMessage(event: MessageEvent<AiResponse>) {
  const response = event.data;
  const job = jobs.get(response.id);
  if (!job) return;

  if (response.kind === "progress") {
    job.onProgress?.(response.progress);
    return;
  }

  jobs.delete(response.id);
  if (response.kind === "done") {
    job.resolve(response.blob);
  } else {
    job.reject(new Error(response.message));
  }
}

function handleError(event: ErrorEvent) {
  // worker 整个挂了：在途任务全部失败，并丢弃它，下次调用重建
  console.error("[Az-im] AI worker error:", event.message);
  stopWorker(event.message || "AI worker crashed");
}

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./WorkerAi.ts", import.meta.url));
    worker.addEventListener("message", handleMessage);
    worker.addEventListener("error", handleError);
  }
  return worker;
}

/**
 * 停止：直接 terminate worker。
 *
 * ORT 的一次 session.run 在 wasm/WebGPU 里跑起来就没法中途叫停，
 * 只有干掉整个线程才能真的把算力还回去——否则用户点了「停止」，
 * 界面停了，风扇还在转。代价是 worker 里缓存的 ORT 会话没了，
 * 下次要重建（模型文件本身还在 Cache API 里，不会重新下载）。
 */
function stopWorker(reason: string) {
  const error = new Error(reason);
  jobs.forEach((job) => job.reject(error));
  jobs.clear();
  worker?.terminate();
  worker = null;
}

function run(
  request: AiTask,
  onProgress?: (progress: AiProgress) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error(AI_CANCELLED));
      return;
    }

    const id = nextId++;
    const onAbort = () => stopWorker(AI_CANCELLED);
    signal?.addEventListener("abort", onAbort, { once: true });

    const settle = <T,>(finish: (value: T) => void) => {
      return (value: T) => {
        signal?.removeEventListener("abort", onAbort);
        finish(value);
      };
    };

    jobs.set(id, {
      resolve: settle(resolve),
      reject: settle(reject),
      onProgress,
    });
    getWorker().postMessage({ ...request, id } as AiRequest);
  });
}

/** 移除图片背景，返回带透明通道的 PNG Blob；signal 中止时 reject(CANCELLED) */
export function removeBackground(
  blob: Blob,
  model: MattingModelKey,
  onProgress?: (progress: AiProgress) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  return run({ kind: "matting", blob, model }, onProgress, signal);
}

/**
 * AI 超分辨率放大，返回 PNG Blob
 * 图片过大时 reject("TOO_LARGE")，signal 中止时 reject(CANCELLED)
 */
export function upscaleImage(
  blob: Blob,
  scale: 2 | 4,
  onProgress?: (progress: AiProgress) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  return run({ kind: "upscale", blob, scale }, onProgress, signal);
}
