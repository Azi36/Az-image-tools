import { cpSync, mkdirSync, rmSync } from "node:fs";

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

// onnxruntime-web 运行时（AI 功能用）：
// 普通版给纯 wasm 后端，jsep 版给 WebGPU 后端
const ortTarget = "public/ort";
rmSync(ortTarget, { recursive: true, force: true });
mkdirSync(ortTarget, { recursive: true });
for (const file of [
  "ort-wasm-simd-threaded.wasm",
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.jsep.wasm",
  "ort-wasm-simd-threaded.jsep.mjs",
  "ort-wasm-simd-threaded.asyncify.wasm",
  "ort-wasm-simd-threaded.asyncify.mjs",
  "ort-wasm-simd-threaded.jspi.wasm",
  "ort-wasm-simd-threaded.jspi.mjs",
]) {
  cpSync(`node_modules/onnxruntime-web/dist/${file}`, `${ortTarget}/${file}`);
}

// OpenCV.js（去水印的经典修复算法用）
const cvTarget = "public/opencv";
rmSync(cvTarget, { recursive: true, force: true });
mkdirSync(cvTarget, { recursive: true });
cpSync("node_modules/@techstark/opencv-js/dist/opencv.js", `${cvTarget}/opencv.js`);