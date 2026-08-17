import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";

const codecs = [
  {
    name: "imagequant",
    assets: ["wasm/imagequant/imagequant.js", "wasm/imagequant/imagequant.wasm"],
  },
  {
    name: "oxipng",
    assets: [
      "wasm/oxipng/squoosh_oxipng.js",
      "wasm/oxipng/squoosh_oxipng_bg.wasm",
    ],
  },
  {
    name: "avif",
    assets: [
      "wasm/avif-enc/avif_enc.js",
      "wasm/avif-enc/avif_enc.wasm",
    ],
  },
  {
    name: "mozjpeg",
    assets: [
      "wasm/mozjpeg-enc/mozjpeg_enc.js",
      "wasm/mozjpeg-enc/mozjpeg_enc.wasm",
    ],
  },
];

for (const codec of codecs) {
  const source = `node_modules/@squoosh-kit/${codec.name}/dist`;
  const target = `public/codecs/${codec.name}`;
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  cpSync(`${source}/index.browser.mjs`, `${target}/index.browser.mjs`);
  for (const asset of codec.assets) {
    mkdirSync(`${target}/${asset.substring(0, asset.lastIndexOf("/"))}`, {
      recursive: true,
    });
    cpSync(`${source}/${asset}`, `${target}/${asset}`);
  }
}

const gifTarget = "public/codecs/gif";
rmSync(gifTarget, { recursive: true, force: true });
mkdirSync(gifTarget, { recursive: true });
cpSync("src/engines/GifWasmModule.js", `${gifTarget}/index.browser.mjs`);

// onnxruntime-web 运行时（AI 功能用）：src/engines/ai.ts 只 import
// "onnxruntime-web/wasm" 和 "onnxruntime-web/webgpu"，各自对应下面两个入口。
//
// 要拷哪些 .wasm 直接从入口文件的引用里扫出来，不写死清单：写死的话，
// ort 换了变体名就变成线上 404，而多余的变体（1.27 里的 jsep / jspi 共 42MB）
// 会一直躺在部署产物里没人下载。
const ortDist = "node_modules/onnxruntime-web/dist";
const ortEntries = ["ort.wasm.bundle.min.mjs", "ort.webgpu.bundle.min.mjs"];
const ortRuntimeFiles = new Set();
for (const entry of ortEntries) {
  const code = readFileSync(`${ortDist}/${entry}`, "utf8");
  for (const match of code.matchAll(/ort-wasm[a-zA-Z0-9._-]*\.(?:wasm|mjs)/g)) {
    if (existsSync(`${ortDist}/${match[0]}`)) {
      ortRuntimeFiles.add(match[0]);
    }
  }
}
if (ortRuntimeFiles.size === 0) {
  throw new Error(
    `未能从 ${ortEntries.join(", ")} 里解析出 ort 运行时文件，AI 功能会加载失败`,
  );
}

const ortTarget = "public/ort";
rmSync(ortTarget, { recursive: true, force: true });
mkdirSync(ortTarget, { recursive: true });
for (const file of ortRuntimeFiles) {
  cpSync(`${ortDist}/${file}`, `${ortTarget}/${file}`);
}

// OpenCV.js（去水印的经典修复算法用）
const cvTarget = "public/opencv";
rmSync(cvTarget, { recursive: true, force: true });
mkdirSync(cvTarget, { recursive: true });
cpSync("node_modules/@techstark/opencv-js/dist/opencv.js", `${cvTarget}/opencv.js`);