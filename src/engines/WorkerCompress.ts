import { Queue } from "./Queue";
import {
  ERROR_UNSUPPORTED_TYPE,
  createFailureOutput,
  convert,
  type MessageData,
} from "./handler";

/**
 * 单个 worker 内串行处理：wasm 编解码是同步阻塞的，在同一线程里
 * 并发多个任务只会互相排队，还多占一份内存。并行度由 WorkerPool
 * 用多个 worker 提供。
 */
(async () => {
  const queue = new Queue(1);

  globalThis.addEventListener(
    "message",
    async (event: MessageEvent<MessageData>) => {
      const { jobId } = event.data;
      queue.push(async () => {
        try {
          const output = await convert(event.data, "compress");
          // convert 返回 null 表示格式不认识，也要如实回报：静默丢弃会让
          // 这张图永远停在「处理中」，整个工具栏跟着一起锁死
          globalThis.postMessage(
            output
              ? { ...output, jobId }
              : {
                  ...createFailureOutput(
                    event.data,
                    "compress",
                    new Error(ERROR_UNSUPPORTED_TYPE),
                  ),
                  jobId,
                },
          );
        } catch (error) {
          globalThis.postMessage({
            ...createFailureOutput(event.data, "compress", error),
            jobId,
          });
        }
      });
    },
  );
})();
