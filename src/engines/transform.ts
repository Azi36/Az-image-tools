import { useEffect } from "react";
import { sprintf } from "sprintf-js";
import { isSupportedType, uniqId } from "@/functions";
import { runInAction, toJS } from "mobx";
import { gstate } from "@/global";
import { ImageItem, homeState } from "@/states/home";
import { CompressOption, MAX_CONCURRENCY, MAX_FILE_SIZE_WARNING } from "./ImageBase";
import { ERROR_PROCESS_CRASHED, type MessageData, type WorkerOutputMessage } from "./handler";
import { WorkerPool } from "./WorkerPool";
import { normalizeCompressOption } from "@/options";

export type { MessageData };

/** meta 用图片的 key：worker 崩了才知道该把哪几张标成失败 */
type Pool = WorkerPool<MessageData, WorkerOutputMessage, number>;

let poolC: Pool | null = null;
let poolP: Pool | null = null;

/**
 * worker 数按核心数定，留一个核给主线程。
 * 每个 worker 会各自实例化一份 wasm 编解码器，所以要封顶控制内存。
 */
function poolSize(max: number): number {
  const cores = globalThis.navigator?.hardwareConcurrency ?? 4;
  return Math.min(max, Math.max(1, cores - 1));
}

function message(data: WorkerOutputMessage) {
  const value = homeState.list.get(data.key);
  if (!value) return;

  runInAction(() => {
    // Field-level update avoids replacing the item and rerendering unrelated rows.
    if (data.width) value.width = data.width;
    if (data.height) value.height = data.height;

    if (data.error) {
      value.processError = data.error;
      value.status = "error";
    }

    if (data.preservedOriginal !== undefined) {
      value.preservedOriginal = data.preservedOriginal;
    }

    if (data.compress) {
      if (!value.compress) homeState.completedCompressCount++;
      homeState.outputSize +=
        data.compress.blob.size - (value.compress?.blob.size ?? 0);
      value.compress = data.compress;
      if (value.status !== "error") value.status = "done";
    }

    if (data.preview) {
      if (!value.preview) homeState.completedPreviewCount++;
      value.preview = data.preview;
    }
  });
}

/** worker 崩溃时如实把这张图标成失败，而不是让它一直转圈 */
function markCrashed(key: number) {
  const item = homeState.list.get(key);
  if (!item || item.status === "done") return;
  runInAction(() => {
    item.status = "error";
    item.processError = ERROR_PROCESS_CRASHED;
  });
}

function createPools() {
  poolC = new WorkerPool(
    poolSize(MAX_CONCURRENCY),
    () => new Worker(new URL("./WorkerCompress.ts", import.meta.url)),
    { onOutput: message, onFailed: markCrashed },
  );
  // 预览只是缩略图，占用小，给两个够了；它挂了不影响压缩本身的状态
  poolP = new WorkerPool(
    poolSize(2),
    () => new Worker(new URL("./WorkerPreview.ts", import.meta.url)),
    { onOutput: message },
  );
}

export function useWorkerHandler() {
  useEffect(() => {
    createPools();

    return () => {
      poolC?.terminate();
      poolP?.terminate();
      poolC = null;
      poolP = null;
    };
  }, []);
}

/**
 * 停止整批处理。
 *
 * 编解码是 worker 里的同步 wasm 调用，没有中断点，只能整个 terminate
 * 再建一批新的——否则用户点了停止，界面停了，CPU 还在满负荷跑。
 */
export function stopAllTasks(showNotice = true) {
  dispatchQueue.length = 0;
  if (dispatchTimer !== null) {
    window.clearTimeout(dispatchTimer);
    dispatchTimer = null;
  }
  poolC?.terminate();
  poolP?.terminate();
  createPools();
  runInAction(() => {
    homeState.markCancelled();
    // 清空列表时也走这里，那种情况下不用再提示「已停止」
    if (showNotice) homeState.showNotice(gstate.locale?.notice.stopped ?? "");
  });
}

function createMessageData(
  item: ImageItem,
  option: CompressOption,
): Omit<MessageData, "jobId"> {
  return {
    /**
     * Why not use the spread operator here?
     * Because it causes an error when used this way,
     * and the exact reason is unknown at the moment.
     *
     * error: `Uncaught (in promise) DOMException: Failed to execute 'postMessage' on 'Worker': #<Object> could not be cloned.`
     * Reproduction method: In the second upload, include the same images as in the first.
     */
    info: {
      key: item.key,
      name: item.name,
      blob: item.blob,
      width: item.width,
      height: item.height,
    },
    option,
  };
}

const dispatchQueue: Array<() => void> = [];
let dispatchTimer: number | null = null;

function flushDispatchQueue() {
  dispatchTimer = null;
  for (let count = 0; count < 8 && dispatchQueue.length > 0; count++) {
    dispatchQueue.shift()!();
  }
  if (dispatchQueue.length > 0) {
    dispatchTimer = window.setTimeout(flushDispatchQueue, 0);
  }
}

function enqueueDispatch(task: () => void) {
  dispatchQueue.push(task);
  if (dispatchTimer === null) {
    dispatchTimer = window.setTimeout(flushDispatchQueue, 0);
  }
}

export function createCompressTask(
  item: ImageItem,
  option: CompressOption = toJS(homeState.option),
) {
  enqueueDispatch(() => poolC?.post(createMessageData(item, option), item.key));
}

function createPreviewTask(item: ImageItem, option: CompressOption) {
  enqueueDispatch(() => poolP?.post(createMessageData(item, option), item.key));
}

/**
 * Handle image files
 * @param files
 */
/** 同名同大小就当成同一张：误拖两次同一个文件夹是最常见的情况 */
function fileFingerprint(file: File) {
  return `${file.name}|${file.size}`;
}

export async function createImageList(input: Array<File>) {
  // 过滤放在这一处：拖拽、选文件、选文件夹都走这里，才数得准忽略了几个
  const supported = input.filter((file) => isSupportedType(file));
  const notices: Array<string> = [];

  const ignored = input.length - supported.length;
  if (ignored > 0) {
    notices.push(sprintf(gstate.locale?.notice.ignoredFiles ?? "", ignored));
  }

  // 去重：既要挡住和列表里已有的重复，也要挡住这一批自己内部的重复
  const seen = new Set<string>();
  homeState.list.forEach((item) => {
    seen.add(`${item.name}|${item.blob.size}`);
  });
  const files: Array<File> = [];
  let duplicates = 0;
  for (const file of supported) {
    const fingerprint = fileFingerprint(file);
    if (seen.has(fingerprint)) {
      duplicates += 1;
      continue;
    }
    seen.add(fingerprint);
    files.push(file);
  }
  if (duplicates > 0) {
    notices.push(sprintf(gstate.locale?.notice.duplicates ?? "", duplicates));
  }

  const largeFiles = files.filter((file) => file.size > MAX_FILE_SIZE_WARNING);
  if (largeFiles.length > 0) {
    notices.push(sprintf(gstate.locale?.notice.largeFiles ?? "", largeFiles.length));
    console.warn(
      `[Az-im] ${largeFiles.length} large file(s): ${largeFiles.slice(0, 3).map((f) => f.name).join(", ")}`,
    );
  }

  if (notices.length > 0) {
    runInAction(() => homeState.showNotice(notices.join(" · ")));
  }

  if (files.length === 0) return;

  const option = normalizeCompressOption(toJS(homeState.tempOption));
  runInAction(() => {
    homeState.tempOption = structuredClone(option);
  });
  runInAction(() => {
    homeState.option = option;
  });
  try {
    localStorage.setItem("az-im-options", JSON.stringify(option));
  } catch {}

  for (let offset = 0; offset < files.length; offset += 40) {
    const items = files.slice(offset, offset + 40).map((file): ImageItem => ({
      key: uniqId(),
      name: file.name,
      blob: file,
      width: 0,
      height: 0,
      src: URL.createObjectURL(file),
      preview: undefined,
      compress: undefined,
      status: "processing",
      processError: undefined,
      preservedOriginal: false,
    }));

    runInAction(() => {
      items.forEach((item) => {
        homeState.list.set(item.key, item);
        homeState.originSize += item.blob.size;
      });
    });

    items.forEach((item) => {
      createPreviewTask(item, option);
      createCompressTask(item, option);
    });

    if (offset + 40 < files.length) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
  }
}
