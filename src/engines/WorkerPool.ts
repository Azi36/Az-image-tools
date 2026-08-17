/**
 * 一组同类 worker 的调度池。
 *
 * 之前是「一个 worker + 内部并发 3」：wasm 编解码是同步阻塞调用，
 * 同一线程上的并发只是交错 await，批量压缩实际只吃得到一个核。
 * 这里改成多个 worker 各自串行，真正跑满多核。
 */

/** 派发目标：当前在途任务最少的那个 worker，并列时取下标最小的 */
export function leastBusyIndex(pending: ReadonlyArray<number>): number {
  let index = 0;
  for (let i = 1; i < pending.length; i++) {
    if (pending[i] < pending[index]) index = i;
  }
  return index;
}

/** 池里进出的消息都得带 jobId，用来精确记账在途任务 */
export type PoolInput = { jobId: number };
export type PoolOutput = { jobId: number };

type PoolOptions<TOut, TMeta> = {
  onOutput: (data: TOut) => void;
  /**
   * worker 崩了的时候回调它身上每个未完成任务的 meta。
   * 不处理的话这些任务永远不回消息，界面就会一直以为「还在跑」。
   */
  onFailed?: (meta: TMeta) => void;
};

type Assignment<TMeta> = { index: number; meta: TMeta };

export class WorkerPool<
  TIn extends PoolInput,
  TOut extends PoolOutput,
  TMeta = undefined,
> {
  private workers: Array<Worker> = [];
  private pending: Array<number> = [];
  /** jobId -> 派给了谁 + 业务侧的标识，避免同一张图重复派发时记错账 */
  private assignment = new Map<number, Assignment<TMeta>>();
  private nextJobId = 1;
  private onOutput: (data: TOut) => void;
  private onFailed?: (meta: TMeta) => void;

  constructor(
    size: number,
    private createWorker: () => Worker,
    options: PoolOptions<TOut, TMeta>,
  ) {
    this.onOutput = options.onOutput;
    this.onFailed = options.onFailed;
    for (let i = 0; i < size; i++) {
      this.workers.push(this.spawn(i));
      this.pending.push(0);
    }
  }

  private spawn(index: number): Worker {
    const worker = this.createWorker();
    worker.addEventListener("message", (event: MessageEvent<TOut>) => {
      this.settle(event.data.jobId, index);
      this.onOutput(event.data);
    });
    worker.addEventListener("error", (event) => {
      console.error("[Az-im] worker error:", event.message);
      this.recover(index);
    });
    return worker;
  }

  /** 换掉崩掉的 worker，并把它身上的任务如实报失败 */
  private recover(index: number) {
    const orphans: Array<TMeta> = [];
    this.assignment.forEach((assignment, jobId) => {
      if (assignment.index !== index) return;
      orphans.push(assignment.meta);
      this.assignment.delete(jobId);
    });

    this.workers[index]?.terminate();
    this.workers[index] = this.spawn(index);
    this.pending[index] = 0;
    orphans.forEach((meta) => this.onFailed?.(meta));
  }

  private settle(jobId: number, fallbackIndex: number) {
    const index = this.assignment.get(jobId)?.index ?? fallbackIndex;
    this.assignment.delete(jobId);
    if (this.pending[index] > 0) this.pending[index]--;
  }

  post(data: Omit<TIn, "jobId">, meta: TMeta = undefined as TMeta) {
    if (this.workers.length === 0) return;
    const index = leastBusyIndex(this.pending);
    const jobId = this.nextJobId++;
    this.assignment.set(jobId, { index, meta });
    this.pending[index]++;
    this.workers[index].postMessage({ ...data, jobId } as TIn);
  }

  /** 还没跑完的任务的 meta，停止时用来标记这些图 */
  pendingMeta(): Array<TMeta> {
    return Array.from(this.assignment.values()).map((item) => item.meta);
  }

  terminate() {
    this.workers.forEach((worker) => worker.terminate());
    this.workers = [];
    this.pending = [];
    this.assignment.clear();
  }
}
