/**
 * 批量重命名规则。
 *
 * 下载单张和打包 zip 都走这里，保证列表里看到的名字就是存下来的名字。
 * 规则只作用于「主名」，扩展名一律由实际输出格式决定——用户手写扩展名
 * 很容易和转码结果对不上，存下来的文件反而打不开。
 */

/** 主名大小写处理 */
export type RenameCase = "keep" | "lower" | "upper" | "capitalize";
/** 扩展名大小写处理 */
export type RenameExtCase = "lower" | "upper";

export type RenameRule = {
  enabled: boolean;
  /** 通用模板，见 RENAME_TOKENS */
  pattern: string;
  /** 按输出格式覆盖模板，键是扩展名（jpg/png/...），空字符串表示用通用模板 */
  perFormat: Record<string, string>;
  /** 序号起点 */
  start: number;
  /** 序号步长 */
  step: number;
  /** 序号补零位数 */
  padding: number;
  /** 在原主名上做查找替换，查找为空表示不替换 */
  find: string;
  replace: string;
  /** find 按正则解析 */
  regex: boolean;
  nameCase: RenameCase;
  extCase: RenameExtCase;
};

export const DefaultRenameRule: RenameRule = {
  enabled: false,
  pattern: "{name}",
  perFormat: {},
  start: 1,
  step: 1,
  padding: 3,
  find: "",
  replace: "",
  regex: false,
  nameCase: "keep",
  extCase: "lower",
};

/** 面板里列出来给人点的占位符；描述走 locale，这里只管键 */
export const RENAME_TOKENS = [
  "name",
  "index",
  "total",
  "ext",
  "originext",
  "width",
  "height",
  "size",
  "date",
  "time",
  "year",
  "month",
  "day",
  "rand",
] as const;

export type RenameToken = (typeof RENAME_TOKENS)[number];

export type RenameContext = {
  /** 原文件名的主名部分（不含扩展名） */
  name: string;
  /** 实际输出的扩展名，不含点 */
  ext: string;
  /** 原文件的扩展名，不含点 */
  originExt: string;
  /** 第几张，从 1 开始按添加顺序数（start/step 在这里之后算） */
  order: number;
  total: number;
  width: number;
  height: number;
  /** 输出体积，字节 */
  size: number;
  now: Date;
};

const MAX_NAME_LENGTH = 120;

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
}

export function normalizeRenameRule(value: unknown): RenameRule {
  const raw = (value !== null && typeof value === "object" ? value : {}) as Partial<RenameRule>;
  const perFormat: Record<string, string> = {};
  if (raw.perFormat && typeof raw.perFormat === "object") {
    for (const [key, template] of Object.entries(raw.perFormat)) {
      if (typeof template === "string" && template.trim()) {
        perFormat[key.toLowerCase()] = template.slice(0, MAX_NAME_LENGTH);
      }
    }
  }
  const nameCase: Array<RenameCase> = ["keep", "lower", "upper", "capitalize"];

  return {
    enabled: raw.enabled === true,
    pattern: typeof raw.pattern === "string" && raw.pattern.trim()
      ? raw.pattern.slice(0, MAX_NAME_LENGTH)
      : DefaultRenameRule.pattern,
    perFormat,
    start: clampNumber(raw.start, 1, 0, 999999),
    step: clampNumber(raw.step, 1, 1, 1000),
    padding: clampNumber(raw.padding, 3, 1, 8),
    find: typeof raw.find === "string" ? raw.find.slice(0, 200) : "",
    replace: typeof raw.replace === "string" ? raw.replace.slice(0, 200) : "",
    regex: raw.regex === true,
    nameCase: nameCase.includes(raw.nameCase as RenameCase) ? (raw.nameCase as RenameCase) : "keep",
    extCase: raw.extCase === "upper" ? "upper" : "lower",
  };
}

/** Windows/macOS 都不接受的字符，连同控制字符一起换成下划线 */
// eslint-disable-next-line no-control-regex
const ILLEGAL_CHARS = /[\\/:*?"<>|\u0000-\u001f]/g;
/** Windows 保留设备名，用户真起了这名字就加个下划线躲开 */
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export function sanitizeFileNameBody(value: string): string {
  const cleaned = value
    .replace(ILLEGAL_CHARS, "_")
    .replace(/\s+/g, " ")
    .trim()
    // 结尾的点和空格在 Windows 上会被悄悄吃掉，先自己去掉
    .replace(/[. ]+$/, "")
    .slice(0, MAX_NAME_LENGTH);
  if (!cleaned) return "";
  return RESERVED.test(cleaned) ? `_${cleaned}` : cleaned;
}

function applyCase(value: string, mode: RenameCase): string {
  if (mode === "lower") return value.toLowerCase();
  if (mode === "upper") return value.toUpperCase();
  if (mode === "capitalize") {
    return value.replace(/(^|[\s_-])(\p{L})/gu, (_, prefix: string, letter: string) =>
      prefix + letter.toUpperCase());
  }
  return value;
}

/** 查找替换：正则写挂了就退回按普通文本处理，不能因为少个括号就整批不改名 */
function applyFindReplace(value: string, rule: RenameRule): string {
  if (!rule.find) return value;
  if (rule.regex) {
    try {
      return value.replace(new RegExp(rule.find, "g"), rule.replace);
    } catch {
      // 落到下面的字面量分支
    }
  }
  return value.split(rule.find).join(rule.replace);
}

function pad(value: number, digits: number): string {
  return String(value).padStart(digits, "0");
}

function two(value: number): string {
  return pad(value, 2);
}

const TOKEN = /\{(\w+)(?::(\d+))?\}/g;

/**
 * 按规则算出一个文件名（含扩展名）。
 * 算出来是空的就退回原名，宁可不改名也不能生成一个没法保存的文件。
 */
export function applyRenameRule(rule: RenameRule, context: RenameContext): string {
  const ext = rule.extCase === "upper" ? context.ext.toUpperCase() : context.ext.toLowerCase();
  const fallback = context.ext ? `${context.name}.${context.ext}` : context.name;
  if (!rule.enabled) return fallback;

  const base = applyCase(applyFindReplace(context.name, rule), rule.nameCase);
  const index = context.order * rule.step - rule.step + rule.start;
  const now = context.now;
  const template = rule.perFormat[context.ext.toLowerCase()] || rule.pattern;

  const body = template.replace(TOKEN, (match, rawKey: string, width?: string) => {
    const key = rawKey.toLowerCase();
    const digits = width ? Number(width) : undefined;
    switch (key) {
      case "name":
        return base;
      case "index":
      case "i":
        return pad(index, digits ?? rule.padding);
      case "total":
        return pad(context.total, digits ?? 1);
      case "ext":
        return ext;
      case "originext":
        return context.originExt;
      case "width":
        return String(context.width || 0);
      case "height":
        return String(context.height || 0);
      case "size":
        // KB 取整：字节数放进文件名太长，也没人按字节找图
        return String(Math.max(1, Math.round(context.size / 1024)));
      case "date":
        return `${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}`;
      case "time":
        return `${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}`;
      case "year":
        return String(now.getFullYear());
      case "month":
        return two(now.getMonth() + 1);
      case "day":
        return two(now.getDate());
      case "rand":
        return Math.random().toString(36).slice(2, 2 + (digits ?? 4));
      default:
        // 不认识的占位符原样留着，用户才看得出自己写错了
        return match;
    }
  });

  const sanitized = sanitizeFileNameBody(body) || sanitizeFileNameBody(context.name);
  if (!sanitized) return fallback;
  return ext ? `${sanitized}.${ext}` : sanitized;
}

const STORAGE_KEY = "az-im-rename";

export function loadRenameRule(): RenameRule {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeRenameRule(JSON.parse(raw));
  } catch {}
  return structuredClone(DefaultRenameRule);
}

export function saveRenameRule(rule: RenameRule) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rule));
  } catch {}
}
