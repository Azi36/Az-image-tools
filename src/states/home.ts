import { CompressOption, ProcessOutput } from "@/engines/ImageBase";
import { createCompressTask } from "@/engines/transform";
import { makeAutoObservable, reaction, toJS } from "mobx";
import { uniqId } from "@/functions";
import { DefaultCompressOption, normalizeCompressOption } from "@/options";
import {
  MAX_USER_PRESETS,
  loadUserPresets,
  saveUserPresets,
  type Preset,
} from "@/presets";

export { DefaultCompressOption } from "@/options";

export interface ProgressHintInfo {
  loadedNum: number;
  totalNum: number;
  percent: number;
  originSize: number;
  outputSize: number;
  rate: number;
}

export type ImageItem = {
  key: number;
  name: string;
  blob: Blob;
  src: string;
  width: number;
  height: number;
  preview?: ProcessOutput;
  compress?: ProcessOutput;
  status: "pending" | "processing" | "done" | "error" | "cancelled";
  /** 这张图自己的设置；没有就跟着全局走 */
  option?: CompressOption;
  processError?: string;
  preservedOriginal?: boolean;
};

function revokeItemUrls(item?: ImageItem) {
  if (!item) return;
  if (item.src) URL.revokeObjectURL(item.src);
  if (item.preview?.src) URL.revokeObjectURL(item.preview.src);
  if (item.compress?.src) URL.revokeObjectURL(item.compress.src);
}

const OPTION_STORAGE_KEY = "az-im-options";

function loadPersistedOption(): CompressOption {
  try {
    const raw = localStorage.getItem(OPTION_STORAGE_KEY);
    if (raw) {
      return normalizeCompressOption(JSON.parse(raw));
    }
  } catch {}
  return normalizeCompressOption(undefined);
}

function persistOption(option: CompressOption) {
  try {
    localStorage.setItem(OPTION_STORAGE_KEY, JSON.stringify(option));
  } catch {}
}

/** 列表筛选：批量场景里靠它把出问题的图挑出来 */
export type ListFilter = "all" | "error" | "cancelled" | "larger";
/** 列表排序：默认是添加顺序，另外两种都是为了把「有问题的」顶到前面 */
export type ListSort = "default" | "sizeDesc" | "rateAsc";

export type ListStats = {
  total: number;
  done: number;
  error: number;
  cancelled: number;
  larger: number;
};

/** 压缩后反而变大了 */
function isLarger(item: ImageItem) {
  return Boolean(item.compress && item.compress.blob.size > item.blob.size);
}

/** 压缩率：越小越好，没结果的排最后 */
function compressRate(item: ImageItem) {
  if (!item.compress || item.blob.size === 0) return Number.POSITIVE_INFINITY;
  return item.compress.blob.size / item.blob.size;
}

/** 一次性提示，id 用来让相同文案也能重新触发 */
export type Notice = { id: number; text: string };

let noticeId = 0;

export class HomeState {
  public list: Map<number, ImageItem> = new Map();
  public notice: Notice | null = null;
  public option: CompressOption = loadPersistedOption();
  public tempOption: CompressOption = loadPersistedOption();
  public compareId: number | null = null;
  public showOption: boolean = false;
  public filter: ListFilter = "all";
  public sort: ListSort = "default";
  public userPresets: Array<Preset> = loadUserPresets();
  /** 正在单独调参的那张图 */
  public editingKey: number | null = null;
  public completedCompressCount: number = 0;
  public completedPreviewCount: number = 0;
  public originSize: number = 0;
  public outputSize: number = 0;

  constructor() {
    makeAutoObservable(this);

    // Auto-persist temp option changes so settings survive page reloads
    // even before the user commits them by starting a batch.
    reaction(
      () => toJS(this.tempOption),
      (opt) => persistOption(opt),
    );
  }

  /**
   * Check whether crop mode
   * @returns
   */
  isCropMode(option: CompressOption = this.option) {
    const resize = option.resize;
    return (
      (resize.method === "presetCrop" &&
        resize.presetCrop?.paperSize != null) ||
      (resize.method === "setCropRatio" &&
        resize.cropWidthRatio &&
        resize.cropHeightRatio &&
        resize.cropWidthRatio > 0 &&
        resize.cropHeightRatio > 0) ||
      (resize.method === "setCropSize" &&
        resize.cropWidthSize &&
        resize.cropHeightSize &&
        resize.cropWidthSize > 0 &&
        resize.cropHeightSize > 0)
    );
  }

  clear() {
    this.list.forEach((item) => revokeItemUrls(item));
    this.list.clear();
    this.filter = "all";
    this.sort = "default";
    this.completedCompressCount = 0;
    this.completedPreviewCount = 0;
    this.originSize = 0;
    this.outputSize = 0;
    this.tempOption = structuredClone(DefaultCompressOption);
    this.option = structuredClone(DefaultCompressOption);
    persistOption(this.option);
  }

  remove(key: number) {
    const item = this.list.get(key);
    if (!item) return;
    this.originSize -= item.blob.size;
    if (item.preview) this.completedPreviewCount--;
    if (item.compress) {
      this.completedCompressCount--;
      this.outputSize -= item.compress.blob.size;
    }
    revokeItemUrls(item);
    this.list.delete(key);
  }

  reCompress() {
    // Persist current options before re-compressing
    persistOption(this.option);
    this.completedCompressCount = 0;
    this.outputSize = 0;
    this.list.forEach((info) => {
      if (info.compress?.src) {
        URL.revokeObjectURL(info.compress.src);
      }
      info.compress = undefined;
      info.status = "processing";
      info.processError = undefined;
      info.preservedOriginal = false;
      createCompressTask(info, toJS(this.optionOf(info)));
    });
  }

  /** 某张图实际生效的设置：自己的优先，没有就用全局 */
  optionOf(item: ImageItem): CompressOption {
    return item.option ?? this.option;
  }

  /** 给单张图设置独立参数并立刻重压这一张 */
  setItemOption(key: number, option: CompressOption | undefined) {
    const item = this.list.get(key);
    if (!item) return;
    item.option = option ? structuredClone(option) : undefined;
    if (item.compress?.src) URL.revokeObjectURL(item.compress.src);
    if (item.compress) {
      this.completedCompressCount--;
      this.outputSize -= item.compress.blob.size;
    }
    item.compress = undefined;
    item.status = "processing";
    item.processError = undefined;
    item.preservedOriginal = false;
    // 派给 worker 的必须是普通对象，observable 代理没法结构化克隆
    createCompressTask(item, toJS(this.optionOf(item)));
  }

  /** 点预设只填进草稿，仍然由「确定」决定什么时候真正生效 */
  applyPreset(preset: Preset) {
    this.tempOption = structuredClone(preset.option);
  }

  /** 存当前草稿为预设，返回是否存下了（超上限就不存） */
  saveCurrentAsPreset(name: string): boolean {
    const trimmed = name.trim();
    if (!trimmed || this.userPresets.length >= MAX_USER_PRESETS) return false;
    this.userPresets = [
      ...this.userPresets,
      {
        id: `user-${uniqId()}`,
        name: trimmed,
        option: normalizeCompressOption(toJS(this.tempOption)),
      },
    ];
    saveUserPresets(this.userPresets);
    return true;
  }

  removePreset(id: string) {
    this.userPresets = this.userPresets.filter((preset) => preset.id !== id);
    saveUserPresets(this.userPresets);
  }

  getStats(): ListStats {
    const stats: ListStats = { total: 0, done: 0, error: 0, cancelled: 0, larger: 0 };
    this.list.forEach((item) => {
      stats.total += 1;
      if (item.status === "done") stats.done += 1;
      if (item.status === "error") stats.error += 1;
      if (item.status === "cancelled") stats.cancelled += 1;
      if (isLarger(item)) stats.larger += 1;
    });
    return stats;
  }

  /** 按当前筛选和排序给出要渲染的列表 */
  getVisibleItems(): Array<ImageItem> {
    const items: Array<ImageItem> = [];
    this.list.forEach((item) => {
      if (this.filter === "error" && item.status !== "error") return;
      if (this.filter === "cancelled" && item.status !== "cancelled") return;
      if (this.filter === "larger" && !isLarger(item)) return;
      items.push(item);
    });

    if (this.sort === "sizeDesc") {
      items.sort((a, b) => b.blob.size - a.blob.size);
    } else if (this.sort === "rateAsc") {
      // 压缩效果最差的排前面，最容易发现「白压了」的那些
      items.sort((a, b) => compressRate(b) - compressRate(a));
    }
    return items;
  }

  showNotice(text: string) {
    noticeId += 1;
    this.notice = { id: noticeId, text };
  }

  /**
   * 是否还有图在处理。
   *
   * 以前是拿完成计数和 list.size 比大小，只要有一张图的消息没回来
   * （格式不认识、worker 崩了），计数就永远追不上，整个工具栏被锁死
   * 到刷新为止。现在直接看每张图自己的状态，谁也卡不住谁。
   */
  hasTaskRunning() {
    for (const item of this.list.values()) {
      if (item.status === "pending" || item.status === "processing") return true;
    }
    return false;
  }

  /** 停止：还没跑完的标成已取消，「重新压缩」可以接着来 */
  markCancelled() {
    this.list.forEach((item) => {
      if (item.status === "pending" || item.status === "processing") {
        item.status = "cancelled";
      }
    });
  }

  /**
   * 获取进度条信息
   * @returns
   */
  getProgressHintInfo(): ProgressHintInfo {
    const totalNum = this.list.size;
    const loadedNum = this.completedCompressCount;
    const originSize = this.originSize;
    const outputSize = this.outputSize;
    const percent = totalNum > 0 ? Math.ceil((loadedNum * 100) / totalNum) : 0;
    const originRate =
      originSize > 0 ? ((outputSize - originSize) * 100) / originSize : 0;
    const rate = Number(Math.abs(originRate).toFixed(2));

    return {
      totalNum,
      loadedNum,
      originSize,
      outputSize,
      percent,
      rate,
    };
  }
}

export const homeState = new HomeState();
