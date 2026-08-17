import assert from "node:assert/strict";
import test from "node:test";
import { WorkerPool, leastBusyIndex } from "@/engines/WorkerPool";

type Listener = (event: { data: unknown; message?: string }) => void;

/** 够用的假 worker：记录收到的消息，并能手动回一条结果 */
class FakeWorker {
  public sent: Array<any> = [];
  private listeners: Record<string, Array<Listener>> = {};

  addEventListener(type: string, listener: Listener) {
    (this.listeners[type] ??= []).push(listener);
  }
  /** 模拟 worker 崩溃 */
  crash(message = "boom") {
    for (const listener of this.listeners.error ?? []) {
      listener({ data: null, message });
    }
  }
  postMessage(data: unknown) {
    this.sent.push(data);
  }
  terminate() {}

  /** 模拟 worker 处理完第 index 条消息后回传结果 */
  reply(index: number, payload: Record<string, unknown> = {}) {
    const { jobId } = this.sent[index];
    for (const listener of this.listeners.message ?? []) {
      listener({ data: { jobId, ...payload } });
    }
  }
}

function createPool(size: number) {
  const workers: Array<FakeWorker> = [];
  const received: Array<any> = [];
  const failed: Array<any> = [];
  const pool = new WorkerPool<any, any, any>(
    size,
    () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker as unknown as Worker;
    },
    {
      onOutput: (data) => received.push(data),
      onFailed: (meta) => failed.push(meta),
    },
  );
  return { pool, workers, received, failed };
}

test("leastBusyIndex picks the idlest worker, ties go to the lowest index", () => {
  assert.equal(leastBusyIndex([0, 0, 0]), 0);
  assert.equal(leastBusyIndex([2, 1, 3]), 1);
  assert.equal(leastBusyIndex([5, 5, 2]), 2);
  assert.equal(leastBusyIndex([1]), 0);
});

test("WorkerPool spreads tasks across workers instead of piling on one", () => {
  const { pool, workers } = createPool(3);

  for (let i = 0; i < 6; i++) pool.post({ payload: i });

  assert.deepEqual(
    workers.map((worker) => worker.sent.length),
    [2, 2, 2],
  );
});

test("WorkerPool reuses a worker once its task reports back", () => {
  const { pool, workers } = createPool(2);

  pool.post({ payload: "a" }); // -> worker 0
  pool.post({ payload: "b" }); // -> worker 1
  workers[0].reply(0); // worker 0 空出来了
  pool.post({ payload: "c" }); // -> worker 0

  assert.equal(workers[0].sent.length, 2);
  assert.equal(workers[1].sent.length, 1);
  assert.deepEqual(
    workers[0].sent.map((message) => message.payload),
    ["a", "c"],
  );
});

test("WorkerPool forwards worker output to the consumer", () => {
  const { pool, workers, received } = createPool(1);

  pool.post({ payload: "a" });
  workers[0].reply(0, { key: 42, compress: { size: 1 } });

  assert.equal(received.length, 1);
  assert.equal(received[0].key, 42);
});

test("WorkerPool keeps accounting straight when a worker answers out of order", () => {
  const { pool, workers } = createPool(2);

  pool.post({ payload: "a" }); // worker 0, job 1
  pool.post({ payload: "b" }); // worker 1, job 2
  pool.post({ payload: "c" }); // worker 0, job 3
  pool.post({ payload: "d" }); // worker 1, job 4

  // worker 1 先把第二条做完，此时它只剩 1 个在途，下一条该给它
  workers[1].reply(1);
  pool.post({ payload: "e" });

  assert.deepEqual(
    workers.map((worker) => worker.sent.length),
    [2, 3],
  );
});

test("WorkerPool reports orphaned tasks and keeps working after a worker crashes", () => {
  const { pool, workers, failed } = createPool(2);

  pool.post({ payload: "a" }, "image-a"); // worker 0
  pool.post({ payload: "b" }, "image-b"); // worker 1
  pool.post({ payload: "c" }, "image-c"); // worker 0

  workers[0].crash();

  // worker 0 身上的两张图要如实报失败，否则界面会一直等它们
  assert.deepEqual(failed.sort(), ["image-a", "image-c"]);
  // 崩掉的位置换上了新 worker（第 3 个实例），池子继续可用
  assert.equal(workers.length, 3);

  pool.post({ payload: "d" }, "image-d");
  assert.equal(workers[2].sent.length, 1);
});

test("WorkerPool exposes still-pending metas so a stop can mark them", () => {
  const { pool, workers } = createPool(2);

  pool.post({ payload: "a" }, "image-a");
  pool.post({ payload: "b" }, "image-b");
  workers[0].reply(0);

  assert.deepEqual(pool.pendingMeta(), ["image-b"]);
});
