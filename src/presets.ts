import type { CompressOption } from "@/engines/ImageBase";
import { DefaultCompressOption, normalizeCompressOption } from "@/options";

export type Preset = {
  id: string;
  /** 内置预设的名字走 locale，自定义预设直接用用户输入的名字 */
  name?: string;
  nameKey?: keyof PresetNames;
  builtin?: boolean;
  option: CompressOption;
};

export type PresetNames = {
  default: string;
  wechat: string;
  blog: string;
  sharp: string;
  extreme: string;
};

const STORAGE_KEY = "az-im-presets";
/** 自定义预设上限，免得 localStorage 被塞爆 */
export const MAX_USER_PRESETS = 12;

type PartialOption = {
  [K in keyof CompressOption]?: Partial<CompressOption[K]>;
};

/** 在默认值基础上改几项，最后统一过一遍校验，保证形状永远是合法的 */
function derive(partial: PartialOption): CompressOption {
  return normalizeCompressOption({
    ...DefaultCompressOption,
    preview: { ...DefaultCompressOption.preview, ...partial.preview },
    resize: { ...DefaultCompressOption.resize, ...partial.resize },
    format: { ...DefaultCompressOption.format, ...partial.format },
    jpeg: { ...DefaultCompressOption.jpeg, ...partial.jpeg },
    png: { ...DefaultCompressOption.png, ...partial.png },
    gif: { ...DefaultCompressOption.gif, ...partial.gif },
    avif: { ...DefaultCompressOption.avif, ...partial.avif },
  });
}

/**
 * 内置预设：覆盖几个最常见的交付场景。
 * 都是在默认值上只改必要的几项，其余保持默认。
 */
export const BUILTIN_PRESETS: Array<Preset> = [
  {
    // 「默认」就是一套未经调整的参数，选择框里第一个、也是初始选中的那个
    id: "builtin-default",
    nameKey: "default",
    builtin: true,
    option: derive({}),
  },
  {
    id: "builtin-wechat",
    nameKey: "wechat",
    builtin: true,
    // 公众号正文宽度撑死 900px，再大都是白扛流量
    option: derive({
      resize: { method: "fitWidth", width: 900 },
      format: { target: "jpg" },
      jpeg: { quality: 0.8 },
    }),
  },
  {
    id: "builtin-blog",
    nameKey: "blog",
    builtin: true,
    // 网页配图：长边限死 1600，转 WebP 体积最省
    option: derive({
      resize: { method: "setLong", long: 1600 },
      format: { target: "webp" },
      jpeg: { quality: 0.8 },
    }),
  },
  {
    id: "builtin-sharp",
    nameKey: "sharp",
    builtin: true,
    // 保细节：不缩放，只做高质量压缩
    option: derive({
      jpeg: { quality: 0.92 },
      png: { colors: 256, dithering: 0.8 },
      avif: { quality: 70 },
    }),
  },
  {
    id: "builtin-extreme",
    nameKey: "extreme",
    builtin: true,
    // 只要小：质量让路，开两个 extreme 档
    option: derive({
      jpeg: { quality: 0.6, extreme: true },
      png: { colors: 64, extreme: true },
      avif: { quality: 35 },
    }),
  },
];

/** 稳定序列化：键排序后再比，避免属性顺序不同就判成两套设置 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`);
  return `{${entries.join(",")}}`;
}

/** 两套设置是否等价，用来高亮「当前用的是哪个预设」 */
export function sameOption(a: CompressOption, b: CompressOption): boolean {
  return stableStringify(a) === stableStringify(b);
}

export function findMatchingPreset(
  option: CompressOption,
  userPresets: ReadonlyArray<Preset>,
): Preset | undefined {
  return [...BUILTIN_PRESETS, ...userPresets].find((preset) =>
    sameOption(preset.option, option),
  );
}

export function loadUserPresets(): Array<Preset> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.id === "string" && typeof item.name === "string")
      .slice(0, MAX_USER_PRESETS)
      .map((item) => ({
        id: item.id as string,
        name: item.name as string,
        option: normalizeCompressOption(item.option),
      }));
  } catch {
    return [];
  }
}

export function saveUserPresets(presets: ReadonlyArray<Preset>) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        presets.map((preset) => ({
          id: preset.id,
          name: preset.name,
          option: preset.option,
        })),
      ),
    );
  } catch {}
}
