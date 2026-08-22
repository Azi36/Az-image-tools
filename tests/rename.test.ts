import assert from "node:assert/strict";
import test from "node:test";
import {
  applyRenameRule,
  DefaultRenameRule,
  normalizeRenameRule,
  sanitizeFileNameBody,
  type RenameContext,
  type RenameRule,
} from "@/rename";

const now = new Date(2026, 7, 22, 14, 30, 5);

function context(part: Partial<RenameContext> = {}): RenameContext {
  return {
    name: "DSC_0001",
    ext: "webp",
    originExt: "jpg",
    order: 1,
    total: 3,
    width: 1600,
    height: 900,
    size: 204800,
    now,
    ...part,
  };
}

function rule(part: Partial<RenameRule> = {}): RenameRule {
  return { ...DefaultRenameRule, enabled: true, ...part };
}

test("关掉规则时一个字都不改", () => {
  assert.equal(
    applyRenameRule({ ...DefaultRenameRule, pattern: "x_{index}" }, context()),
    "DSC_0001.webp",
  );
});

test("每个占位符都换成实际的值", () => {
  const name = applyRenameRule(
    rule({ pattern: "{name}-{index}-{total}-{width}x{height}-{size}-{originext}-{date}-{time}" }),
    context(),
  );
  assert.equal(name, "DSC_0001-001-3-1600x900-200-jpg-20260822-143005.webp");
});

test("序号听 start/step/padding，也能就地写死位数", () => {
  const numbering = rule({ pattern: "img_{index}", start: 10, step: 5, padding: 4 });
  assert.equal(applyRenameRule(numbering, context({ order: 1 })), "img_0010.webp");
  assert.equal(applyRenameRule(numbering, context({ order: 3 })), "img_0020.webp");
  assert.equal(
    applyRenameRule(rule({ pattern: "img_{index:2}" }), context({ order: 7 })),
    "img_07.webp",
  );
});

test("扩展名跟着实际输出格式走，模板管不着", () => {
  const shared = rule({ pattern: "shot_{index}" });
  assert.equal(applyRenameRule(shared, context({ ext: "png" })), "shot_001.png");
  assert.equal(applyRenameRule(shared, context({ ext: "avif" })), "shot_001.avif");
  assert.equal(
    applyRenameRule(rule({ pattern: "a", extCase: "upper" }), context({ ext: "jpg" })),
    "a.JPG",
  );
});

test("分格式模板压过通用模板，同一批混格式也各归各的", () => {
  const mixed = rule({
    pattern: "generic_{index}",
    perFormat: { png: "透明图_{index}", avif: "{name}@{width}" },
  });
  assert.equal(applyRenameRule(mixed, context({ ext: "png" })), "透明图_001.png");
  assert.equal(applyRenameRule(mixed, context({ ext: "avif" })), "DSC_0001@1600.avif");
  assert.equal(applyRenameRule(mixed, context({ ext: "webp" })), "generic_001.webp");
});

test("查找替换支持字面量和正则，正则写挂了退回字面量", () => {
  assert.equal(
    applyRenameRule(rule({ find: "DSC_", replace: "photo-" }), context()),
    "photo-0001.webp",
  );
  assert.equal(
    applyRenameRule(rule({ find: "\\d+$", replace: "final", regex: true }), context()),
    "DSC_final.webp",
  );
  // 少一个括号：不能因此整批不改名
  assert.equal(
    applyRenameRule(rule({ find: "(DSC", replace: "x", regex: true }), context()),
    "DSC_0001.webp",
  );
});

test("大小写四档都按说的来", () => {
  const cases: Array<[RenameRule["nameCase"], string]> = [
    ["keep", "my photo.webp"],
    ["lower", "my photo.webp"],
    ["upper", "MY PHOTO.webp"],
    ["capitalize", "My Photo.webp"],
  ];
  for (const [nameCase, expected] of cases) {
    assert.equal(
      applyRenameRule(rule({ nameCase }), context({ name: "my photo" })),
      expected,
    );
  }
});

test("文件系统不收的字符全部换掉，保留设备名也躲开", () => {
  assert.equal(sanitizeFileNameBody('a/b:c*d?e"f<g>h|i'), "a_b_c_d_e_f_g_h_i");
  assert.equal(sanitizeFileNameBody("trailing. "), "trailing");
  assert.equal(sanitizeFileNameBody("CON"), "_CON");
  assert.equal(
    applyRenameRule(rule({ pattern: "{name}/{index}" }), context({ name: "a" })),
    "a_001.webp",
  );
});

test("模板算出来是空的就退回原名，不生成一个存不下的文件", () => {
  assert.equal(applyRenameRule(rule({ pattern: "   " }), context()), "DSC_0001.webp");
});

test("认不出的占位符原样留着，用户才看得出自己写错了", () => {
  assert.equal(applyRenameRule(rule({ pattern: "{nmae}_1" }), context()), "{nmae}_1.webp");
});

test("规范化挡住越界值和脏数据", () => {
  const normalized = normalizeRenameRule({
    enabled: "yes",
    pattern: "   ",
    perFormat: { PNG: "a", webp: "   ", gif: 42 },
    start: -5,
    step: 0,
    padding: 99,
    nameCase: "sideways",
    extCase: "upper",
    regex: 1,
  });

  assert.equal(normalized.enabled, false);
  assert.equal(normalized.pattern, DefaultRenameRule.pattern);
  assert.deepEqual(normalized.perFormat, { png: "a" });
  assert.equal(normalized.start, 0);
  assert.equal(normalized.step, 1);
  assert.equal(normalized.padding, 8);
  assert.equal(normalized.nameCase, "keep");
  assert.equal(normalized.extCase, "upper");
  assert.equal(normalized.regex, false);
});
