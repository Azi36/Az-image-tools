import assert from "node:assert/strict";
import test from "node:test";
import { HomeState, type ImageItem } from "@/states/home";

function makeItem(
  key: number,
  status: ImageItem["status"],
  sizes?: { origin: number; output?: number },
): ImageItem {
  const origin = sizes?.origin ?? 1;
  return {
    key,
    name: `${key}.png`,
    blob: new Blob(["x".repeat(origin)]),
    src: "",
    width: 1,
    height: 1,
    status,
    compress:
      sizes?.output === undefined
        ? undefined
        : {
            width: 1,
            height: 1,
            src: "",
            blob: new Blob(["x".repeat(sizes.output)]),
          },
  };
}

test("hasTaskRunning tracks per-image status, not a global counter", () => {
  const state = new HomeState();
  state.list.set(1, makeItem(1, "processing"));
  assert.equal(state.hasTaskRunning(), true);

  state.list.get(1)!.status = "done";
  assert.equal(state.hasTaskRunning(), false);
});

test("一张图没回消息也不该把整个工具栏永久锁死", () => {
  const state = new HomeState();
  state.list.set(1, makeItem(1, "done"));
  state.list.set(2, makeItem(2, "error"));

  // 旧实现是拿 completedCompressCount 和 list.size 比大小：只要有图的
  // 消息没回来（格式不认识、worker 崩了），计数就永远追不上，界面只能刷新。
  // 现在计数怎么样都不影响「是否还在跑」的判断。
  state.completedCompressCount = 0;
  state.completedPreviewCount = 0;

  assert.equal(state.hasTaskRunning(), false);
});

test("markCancelled only stops what is still in flight", () => {
  const state = new HomeState();
  state.list.set(1, makeItem(1, "processing"));
  state.list.set(2, makeItem(2, "pending"));
  state.list.set(3, makeItem(3, "done"));
  state.list.set(4, makeItem(4, "error"));

  state.markCancelled();

  assert.equal(state.list.get(1)!.status, "cancelled");
  assert.equal(state.list.get(2)!.status, "cancelled");
  // 已经出结果的和已经失败的不该被改写
  assert.equal(state.list.get(3)!.status, "done");
  assert.equal(state.list.get(4)!.status, "error");
  assert.equal(state.hasTaskRunning(), false);
});

test("showNotice bumps the id so the same text can re-trigger", () => {
  const state = new HomeState();
  state.showNotice("已停止");
  const first = state.notice!;
  state.showNotice("已停止");
  const second = state.notice!;

  assert.equal(second.text, "已停止");
  assert.notEqual(second.id, first.id);
});

test("getStats counts every bucket the filter chips need", () => {
  const state = new HomeState();
  state.list.set(1, makeItem(1, "done", { origin: 100, output: 40 }));
  state.list.set(2, makeItem(2, "error"));
  state.list.set(3, makeItem(3, "cancelled"));
  // 压缩后反而变大了
  state.list.set(4, makeItem(4, "done", { origin: 50, output: 80 }));

  const stats = state.getStats();
  assert.equal(stats.total, 4);
  assert.equal(stats.done, 2);
  assert.equal(stats.error, 1);
  assert.equal(stats.cancelled, 1);
  assert.equal(stats.larger, 1);
});

test("getVisibleItems filters down to the bucket you picked", () => {
  const state = new HomeState();
  state.list.set(1, makeItem(1, "done", { origin: 100, output: 40 }));
  state.list.set(2, makeItem(2, "error"));
  state.list.set(3, makeItem(3, "cancelled"));

  state.filter = "error";
  assert.deepEqual(state.getVisibleItems().map((item) => item.key), [2]);

  state.filter = "cancelled";
  assert.deepEqual(state.getVisibleItems().map((item) => item.key), [3]);

  state.filter = "all";
  assert.equal(state.getVisibleItems().length, 3);
});

test("sorting surfaces the biggest files and the worst compression first", () => {
  const state = new HomeState();
  state.list.set(1, makeItem(1, "done", { origin: 10, output: 1 }));   // 压到 10%
  state.list.set(2, makeItem(2, "done", { origin: 100, output: 95 })); // 几乎没压动
  state.list.set(3, makeItem(3, "done", { origin: 50, output: 20 }));

  state.sort = "sizeDesc";
  assert.deepEqual(state.getVisibleItems().map((item) => item.key), [2, 3, 1]);

  state.sort = "rateAsc";
  assert.deepEqual(state.getVisibleItems().map((item) => item.key), [2, 3, 1]);

  state.sort = "default";
  assert.deepEqual(state.getVisibleItems().map((item) => item.key), [1, 2, 3]);
});

test("optionOf falls back to the global option until an image overrides it", () => {
  const state = new HomeState();
  const item = makeItem(1, "done");
  state.list.set(1, item);

  assert.equal(state.optionOf(item), state.option);

  item.option = { ...state.option, jpeg: { quality: 0.3, extreme: true } };
  assert.equal(state.optionOf(item).jpeg.quality, 0.3);
  // 全局的那份不能被带跑偏
  assert.notEqual(state.option.jpeg.quality, 0.3);
});

test("isCropMode can be asked about a specific image's option", () => {
  const state = new HomeState();
  assert.equal(Boolean(state.isCropMode()), false);

  const cropping = {
    ...state.option,
    resize: { ...state.option.resize, method: "setCropSize" as const, cropWidthSize: 100, cropHeightSize: 100 },
  };
  assert.equal(Boolean(state.isCropMode(cropping)), true);
  // 单张图开了裁剪，不该影响对全局的判断
  assert.equal(Boolean(state.isCropMode()), false);
});
