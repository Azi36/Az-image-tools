/**
 * AI 功能的共享层：模型元信息、进度类型、主/worker 通信协议，
 * 以及主线程能直接用的轻量工具。
 *
 * 这里不能碰 onnxruntime —— 推理跑在 WorkerAi 里，视图只应该
 * 通过 aiClient 调它。
 */

export type AiProgress =
  /** 下载模型：loaded/total 为 0 表示服务端没给 content-length，只能显示百分比 */
  | { stage: "model"; percent: number; loaded: number; total: number }
  | { stage: "run"; percent?: number };

/** 用户主动停止时抛出的 message，视图靠它区分「失败」和「已停止」 */
export const AI_CANCELLED = "CANCELLED";

export const MODEL_CACHE = "az-im-models";

// ---------- 模型 ----------

export type MattingModelKey = "u2netp" | "silueta";

export const MATTING_MODELS: Array<{
  key: MattingModelKey;
  label: string;
  desc: string;
  url: string;
  sizeMB: number;
  inputSize: number;
  norm: "imagenet" | "half";
}> = [
  {
    key: "u2netp",
    label: "快速",
    desc: "4.4MB · 秒出结果，日常够用",
    url: "/models/u2netp.onnx",
    sizeMB: 4.4,
    inputSize: 320,
    norm: "imagenet",
  },
  {
    key: "silueta",
    label: "高质量",
    desc: "42MB · 细节更完整，处理更慢",
    url: "/models/silueta.onnx",
    sizeMB: 42,
    inputSize: 320,
    norm: "imagenet",
  },
];

export const UPSCALE_MODEL_URL = "/models/realesr-general-x4v3.onnx";
export const MAX_UPSCALE_EDGE = 2000;

// ---------- 主线程 ↔ WorkerAi 协议 ----------

export type AiTask =
  | { kind: "matting"; blob: Blob; model: MattingModelKey }
  | { kind: "upscale"; blob: Blob; scale: 2 | 4 };

/** 交叉写法而不是 Omit<AiRequest, "id">：后者作用在联合上会把两支的字段吃掉 */
export type AiRequest = AiTask & { id: number };

export type AiResponse =
  | { id: number; kind: "progress"; progress: AiProgress }
  | { id: number; kind: "done"; blob: Blob }
  | { id: number; kind: "error"; message: string };

// ---------- 主线程工具 ----------

export function webGpuAvailable(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

/** 模型是否已经在本地缓存里（用于 UI 显示「已下载」） */
export async function isModelCached(url: string): Promise<boolean> {
  try {
    const cache = await caches.open(MODEL_CACHE);
    return Boolean(await cache.match(url));
  } catch {
    return false;
  }
}
