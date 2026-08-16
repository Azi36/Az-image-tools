import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { Brush, Download, Eraser, ImagePlus, RotateCcw, Wand2 } from "lucide-react";
import style from "./index.module.scss";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { inpaintImage } from "@/engines/inpaint";
import { createDownload } from "@/functions";

const copy = {
  eyebrow: "本地算法 · 图片不出浏览器",
  title: "在线去水印",
  summary: "涂抹水印，一键修复。经典修复算法本地执行，图片照旧不上传。",
  dropTitle: "选取图片到这里，支持拖拽和粘贴",
  dropHint: "首次使用需加载修复引擎（约 12MB），之后走浏览器缓存",
  brushLabel: "画笔",
  hint: "把水印、logo、杂物涂红，然后点「移除」。修完还能继续涂，逐步清干净。",
  clear: "清空涂抹",
  apply: "移除",
  applying: "修复中……",
  engineLoading: "正在加载修复引擎……",
  download: "下载 PNG",
  again: "换一张",
  failed: "处理失败了，刷新页面再试一次",
};

// 处理分辨率上限：太大的图 OpenCV 会明显变慢
const MAX_EDGE = 2400;

const Inpaint = observer(() => {
  const [mode, setMode] = useState<"idle" | "edit">("idle");
  const [busy, setBusy] = useState(false);
  const [busyText, setBusyText] = useState("");
  const [error, setError] = useState(false);
  const [brush, setBrush] = useState(26);
  const [hasStrokes, setHasStrokes] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const baseCanvas = useRef<HTMLCanvasElement>(null);
  const maskCanvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);

  const reset = () => {
    setMode("idle");
    setBusy(false);
    setError(false);
    setHasStrokes(false);
  };

  const loadImage = async (file: Blob) => {
    const bitmap = await createImageBitmap(file);
    let { width, height } = bitmap;
    const longEdge = Math.max(width, height);
    if (longEdge > MAX_EDGE) {
      const rate = MAX_EDGE / longEdge;
      width = Math.round(width * rate);
      height = Math.round(height * rate);
    }
    setMode("edit");
    setHasStrokes(false);
    setError(false);
    // 等 canvas 挂载后再画
    requestAnimationFrame(() => {
      const base = baseCanvas.current;
      const mask = maskCanvas.current;
      if (!base || !mask) return;
      base.width = width;
      base.height = height;
      mask.width = width;
      mask.height = height;
      const context = base.getContext("2d")!;
      context.drawImage(bitmap, 0, 0, width, height);
      mask.getContext("2d")!.clearRect(0, 0, width, height);
      bitmap.close();
    });
  };

  const pickFile = (files?: FileList | null) => {
    const file = Array.from(files ?? []).find((item) =>
      item.type.startsWith("image/"),
    );
    if (file && !busy) loadImage(file);
  };

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if (busy) return;
      const file = Array.from(event.clipboardData?.files ?? []).find((item) =>
        item.type.startsWith("image/"),
      );
      if (file) {
        event.preventDefault();
        loadImage(file);
      }
    };
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [busy]);

  // 画笔：屏幕坐标 → canvas 天然分辨率坐标
  const canvasPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = maskCanvas.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const strokeTo = (point: { x: number; y: number }) => {
    const canvas = maskCanvas.current!;
    const context = canvas.getContext("2d")!;
    const scale = canvas.width / canvas.getBoundingClientRect().width;
    context.strokeStyle = "rgba(226, 58, 46, .75)";
    context.lineWidth = brush * scale;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    const from = lastPoint.current ?? point;
    context.moveTo(from.x, from.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    lastPoint.current = point;
    setHasStrokes(true);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (busy) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    lastPoint.current = null;
    strokeTo(canvasPoint(event));
  };
  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || busy) return;
    strokeTo(canvasPoint(event));
  };
  const onPointerUp = () => {
    drawing.current = false;
    lastPoint.current = null;
  };

  const clearMask = () => {
    const mask = maskCanvas.current;
    if (mask) mask.getContext("2d")!.clearRect(0, 0, mask.width, mask.height);
    setHasStrokes(false);
  };

  const apply = async () => {
    const base = baseCanvas.current;
    const mask = maskCanvas.current;
    if (!base || !mask || !hasStrokes || busy) return;
    setBusy(true);
    setBusyText(copy.engineLoading);
    try {
      // 引擎加载完立刻切换文案
      const timer = setTimeout(() => setBusyText(copy.applying), 400);
      const result = await inpaintImage(base, mask);
      clearTimeout(timer);
      const bitmap = await createImageBitmap(result);
      base.getContext("2d")!.drawImage(bitmap, 0, 0);
      bitmap.close();
      clearMask();
    } catch (err) {
      console.error("[Az-im] inpaint failed:", err);
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    baseCanvas.current?.toBlob((blob) => {
      if (blob) createDownload("az-im-inpaint.png", blob);
    }, "image/png");
  };

  return (
    <div className={style.page} id="top">
      <SiteHeader active="inpaint" />

      <main>
        <section className={style.hero}>
          <div className={style.decor} aria-hidden="true"><i /><i /><i /><span /></div>
          <div className={style.heroCopy}>
            <span className={style.eyebrow}><Wand2 size={16} />{copy.eyebrow}</span>
            <h1>{copy.title}</h1>
            <p>{copy.summary}</p>
          </div>

          {mode === "edit" && (
            <div className={style.toolbar}>
              <span className={style.toolbarLabel}><Brush size={14} />{copy.brushLabel}</span>
              <input
                className={style.brushRange}
                type="range"
                min={8}
                max={80}
                value={brush}
                disabled={busy}
                onChange={(event) => setBrush(Number(event.target.value))}
              />
              <span className={style.brushSize}>{brush}px</span>
              <span className={style.toolbarHint}>{copy.hint}</span>
            </div>
          )}

          <div className={style.workspace}>
            {mode === "idle" && (
              <button
                type="button"
                className={`${style.dropzone} ${dragOver ? style.dragOver : ""}`}
                onClick={() => fileInput.current?.click()}
                onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(event) => { event.preventDefault(); setDragOver(false); pickFile(event.dataTransfer.files); }}
              >
                <span className={style.dropIcon}><ImagePlus size={34} /></span>
                <strong>{copy.dropTitle}</strong>
                <p>{copy.dropHint}</p>
              </button>
            )}

            {mode === "edit" && (
              <div className={style.editor}>
                <div className={style.stage}>
                  <canvas ref={baseCanvas} />
                  <canvas
                    ref={maskCanvas}
                    className={style.maskLayer}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                  />
                  {busy && (
                    <div className={style.stageBusy}>
                      <div className={`${style.progressBar} ${style.indeterminate}`}><i /></div>
                      <span>{busyText}</span>
                    </div>
                  )}
                </div>
                {error && <p className={style.stageError}>{copy.failed}</p>}
                <div className={style.resultActions}>
                  <button type="button" className="button" disabled={busy} onClick={reset}><RotateCcw size={16} />{copy.again}</button>
                  <button type="button" className="button" disabled={busy || !hasStrokes} onClick={clearMask}><Eraser size={16} />{copy.clear}</button>
                  <button type="button" className="button" disabled={busy} onClick={download}><Download size={16} />{copy.download}</button>
                  <button type="button" className="button buttonPrimary" disabled={busy || !hasStrokes} onClick={apply}><Wand2 size={16} />{copy.apply}</button>
                </div>
              </div>
            )}

            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => { pickFile(event.target.files); event.target.value = ""; }}
            />
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
});

export default Inpaint;
