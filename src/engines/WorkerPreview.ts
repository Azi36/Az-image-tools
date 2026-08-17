import { Queue } from "./Queue";
import {
  ERROR_UNSUPPORTED_TYPE,
  createFailureOutput,
  convert,
  type MessageData,
} from "./handler";

/** 与 WorkerCompress 同构：worker 内串行，并行度交给 WorkerPool */
(async () => {
  const queue = new Queue(1);

  globalThis.addEventListener(
    "message",
    async (event: MessageEvent<MessageData>) => {
      const { jobId } = event.data;
      queue.push(async () => {
        try {
          const output = await convert(event.data, "preview");
          // convert 返回 null 表示格式不认识，也要如实回报：静默丢弃会让
          // 这张图永远停在「处理中」，整个工具栏跟着一起锁死
          globalThis.postMessage(
            output
              ? { ...output, jobId }
              : {
                  ...createFailureOutput(
                    event.data,
                    "preview",
                    new Error(ERROR_UNSUPPORTED_TYPE),
                  ),
                  jobId,
                },
          );
        } catch (error) {
          globalThis.postMessage({
            ...createFailureOutput(event.data, "preview", error),
            jobId,
          });
        }
      });
    },
  );
})();
