# Az-im

Azi36 的在线批量图片压缩工具。压缩、转换、缩放、裁剪，全部在浏览器本地完成，图片不经过任何服务器。

线上地址：https://im.azi36.com （主站：https://azi36.com） · 仓库：https://github.com/Azi36/Az-image-tools

## 特性

- **图片压缩**：批量压缩 JPEG / PNG / WebP / GIF / SVG / AVIF，支持 HEIC/HEIF 输入；格式互转、按宽高/长短边/百分比缩放、比例/固定尺寸/纸张预设裁剪、常用交付尺寸一键填；前后对比、打包 ZIP
- **背景移除**（/matting/）：本地 AI 抠图，快速（U2-Netp 4.4MB）/ 高质量（Silueta 42MB）双模型可选
- **图片放大**（/upscale/）：Real-ESRGAN 超分辨率 2x/4x，分块推理
- **去水印**（/inpaint/）：涂抹 + OpenCV 修复算法，可迭代多轮
- AI 推理优先 WebGPU，失败自动降级 wasm；模型 Cache API 持久缓存
- 纯前端：一切在浏览器本地完成，无上传、无留存
- 深浅色主题与主站 azi36.com 联动

## 开发

```bash
npm install
npm run dev          # 开发服务器 http://localhost:3000
npm test             # 测试
npm run typecheck    # TypeScript 检查
npm run lint         # ESLint（flat config，见 eslint.config.mjs）
npm run build:pages  # 静态导出到 out/，用于 GitHub Pages 等静态托管
```

## 部署（GitHub Pages）

仓库内置 `.github/workflows/deploy.yml`：push 到 `main` 自动执行 `npm run build:pages` 并发布 `out/` 到 GitHub Pages。仓库 Settings → Pages 里把 Source 设为 **GitHub Actions**，再绑定自定义域名 `im.azi36.com` 即可。

## 致谢与许可

基于 [joye61/pic-smaller](https://github.com/joye61/pic-smaller)（MIT）二次开发，感谢原作者及其依赖的
[Squoosh Kit](https://github.com/bnowak008/squoosh-kit)、[heic-to](https://github.com/hoppergee/heic-to)、[SVGO](https://github.com/svg/svgo)、[gifsicle-wasm-browser](https://github.com/renzhezhilu/gifsicle-wasm-browser)。

MIT License · © Azi36
