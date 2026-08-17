import assert from "node:assert/strict";
import test from "node:test";
import {
  BUILTIN_PRESETS,
  findMatchingPreset,
  sameOption,
} from "@/presets";
import { DefaultCompressOption, normalizeCompressOption } from "@/options";

test("every builtin preset is already a normalized, valid option", () => {
  for (const preset of BUILTIN_PRESETS) {
    // 过一遍校验不该有任何变化，否则说明预设里写了非法值
    assert.deepEqual(
      normalizeCompressOption(preset.option),
      preset.option,
      `${preset.id} 不是规范化的设置`,
    );
    assert.ok(preset.builtin);
    assert.ok(preset.nameKey);
  }
});

test("builtin presets are actually distinct from each other", () => {
  const seen = new Set<string>();
  for (const preset of BUILTIN_PRESETS) {
    const key = JSON.stringify(preset.option);
    assert.equal(seen.has(key), false, `${preset.id} 和别的预设设置一样`);
    seen.add(key);
  }
});

test("sameOption ignores key order, not values", () => {
  const a = normalizeCompressOption(DefaultCompressOption);
  const b = normalizeCompressOption(JSON.parse(JSON.stringify(DefaultCompressOption)));
  assert.equal(sameOption(a, b), true);

  const changed = normalizeCompressOption({
    ...DefaultCompressOption,
    jpeg: { ...DefaultCompressOption.jpeg, quality: 0.5 },
  });
  assert.equal(sameOption(a, changed), false);
});

test("findMatchingPreset spots both builtin and user presets", () => {
  const balanced = BUILTIN_PRESETS.find((item) => item.id === "builtin-balanced")!;
  assert.equal(findMatchingPreset(balanced.option, [])?.id, "builtin-balanced");

  const custom = {
    id: "user-1",
    name: "我的",
    option: normalizeCompressOption({
      ...DefaultCompressOption,
      jpeg: { quality: 0.42, extreme: false },
    }),
  };
  assert.equal(findMatchingPreset(custom.option, [custom])?.id, "user-1");

  // 改一点就不该再匹配上任何预设
  const drifted = normalizeCompressOption({
    ...custom.option,
    jpeg: { quality: 0.43, extreme: false },
  });
  assert.equal(findMatchingPreset(drifted, [custom]), undefined);
});
