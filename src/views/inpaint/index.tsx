import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import {
  Brush,
  Download,
  Eraser,
  History,
  ImagePlus,
  RotateCcw,
  Undo2,
  Wand2,
} from "lucide-react";
import style from "./index.module.scss";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { inpaintImage } from "@/engines/inpaint";
import { useImageDrop } from "@/hooks";
import { createDownload } from "@/functions";

const copy = {
  eyebrow: "本地算法 · 图片不出浏览器",
  title: "在线去水印",
  summary: "涂抹水印，一键修复。经典修复算法本地执行，图片照旧不上传。",
  dropTitle: "选取图片到这里，支持拖拽和粘贴",
  dropHint: "首次使用需加载修复引擎（约 12MB），之后走浏览器缓存",
  brushLabel: "画笔",
  hint: "把水印、logo、杂物涂红，然后点「移除」。修完还能继续涂，逐步清干净。",
  undoStroke: "撤销涂抹",
  clear: "清空涂抹",
  undoRepair: "撤销上一次修复",
  restore: "恢复原图",
  apply: "移除",
  applying: "修复中，这一步会占用页面几秒……",
  engineLoading: "正在加载修复引擎（约 12MB）……",
  download: "下载 PNG",
  again: "换一张",
  retry: "重试",
  failed: "修复失败了，可以撤销涂抹换个范围再试",
  repaired: (times: number) => `已修复 ${times} 次`,
  strokeHint: "涂抹后「移除」才会亮起",
};

// 处理分辨率上限：太大的图 OpenCV 会明显变慢
const MAX_EDGE = 2400;
// 修复历史保留步数，太多会把内存吃满
const MAX_HISTORY = 10;

type Stroke = {
  /** canvas 原生分辨率下的线宽，重绘时才不会因为窗口缩放而变形 */
  width: number;
  points: Array<{ x: number; y: number }>;
};

const Inpaint = observer(() => {
  const [mode, setMode] = useState<"idle" | "edit">("idle");
  const [busy, setBusy] = useState(false);
  const [busyText, setBusyText] = useState("");
  const [error, setError] = useState(false);
  const [brush, setBrush] = useState(26);
  const [strokeCount, setStrokeCount] = useState(0);
  const [repairCount, setRepairCount] = useState(0);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const baseCanvas = useRef<HTMLCanvasElement>(null);
  const maskCanvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const strokes = useRef<Array<Stroke>>([]);
  /** 每次修复前的画面快照，用来一步步回退 */
  const history = useRef<Array<Blob>>([]);
  /** 最初的画面，用来一键恢复 */
  const original = useRef<Blob | null>(null);

  const reset = () => {
    setMode("idle");
    setBusy(false);
    setError(false);
    setStrokeCount(0);
    setRepairCount(0);
    setSize(null);
    strokes.current = [];
    history.current = [];
    original.current = null;
  };

  const snapshot = (): Promise<Blob | null> =>
    new Promise((resolve) =>
      baseCanvas.current
        ? baseCanvas.current.toBlob((blob) => resolve(blob), "image/png")
        : resolve(null),
    );

  const drawBlob = async (blob: Blob) => {
    const base = baseCanvas.current;
    if (!base) return;
    const bitmap = await createImageBitmap(blob);
    const context = base.getContext("2d")!;
    context.clearRect(0, 0, base.width, base.height);
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
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
    setError(false);
    setStrokeCount(0);
    setRepairCount(0);
    setSize({ width, height });
    strokes.current = [];
    history.current = [];
    // 等 canvas 挂载后再画
    requestAnimationFrame(async () => {
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
      original.current = await snapshot();
    });
  };

  const pickFile = (files?: FileList | null) => {
    const file = Array.from(files ?? []).find((item) =>
      item.type.startsWith("image/"),
    );
    if (file && !busy) loadImage(file);
  };

  // 整页都能接住拖进来的图
  const dragging = useImageDrop((file) => loadImage(file), !busy);

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
    // loadImage 每次渲染都是新函数，只需要在 busy 变化时重新绑定
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const applyStrokeStyle = (context: CanvasRenderingContext2D, width: number) => {
    context.strokeStyle = "rgba(226, 58, 46, .75)";
    context.lineWidth = width;
    context.lineCap = "round";
    context.lineJoin = "round";
  };

  /** 撤销一笔之后没法「反向擦除」，只能清空重画所有笔画 */
  const redrawMask = () => {
    const mask = maskCanvas.current;
    if (!mask) return;
    const context = mask.getContext("2d")!;
    context.clearRect(0, 0, mask.width, mask.height);
    for (const stroke of strokes.current) {
      applyStrokeStyle(context, stroke.width);
      context.beginPath();
      const [first, ...rest] = stroke.points;
      context.moveTo(first.x, first.y);
      if (rest.length === 0) {
        // 单击一个点也要落下一个圆点
        context.lineTo(first.x, first.y);
      }
      for (const point of rest) context.lineTo(point.x, point.y);
      context.stroke();
    }
  };

  const strokeTo = (point: { x: number; y: number }) => {
    const mask = maskCanvas.current;
    const stroke = strokes.current[strokes.current.length - 1];
    if (!mask || !stroke) return;
    const context = mask.getContext("2d")!;
    const from = stroke.points[stroke.points.length - 1] ?? point;
    stroke.points.push(point);
    applyStrokeStyle(context, stroke.width);
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(point.x, point.y);
    context.stroke();
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (busy) return;
    const canvas = maskCanvas.current!;
    const scale = canvas.width / canvas.getBoundingClientRect().width;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    strokes.current.push({ width: brush * scale, points: [] });
    strokeTo(canvasPoint(event));
    setStrokeCount(strokes.current.length);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || busy) return;
    strokeTo(canvasPoint(event));
  };
  const onPointerUp = () => {
    drawing.current = false;
  };

  const undoStroke = () => {
    strokes.current.pop();
    setStrokeCount(strokes.current.length);
    redrawMask();
  };

  const clearMask = () => {
    strokes.current = [];
    setStrokeCount(0);
    redrawMask();
  };

  const undoRepair = async () => {
    const previous = history.current.pop();
    if (!previous) return;
    await drawBlob(previous);
    setRepairCount(history.current.length);
    clearMask();
  };

  const restoreOriginal = async () => {
    if (!original.current) return;
    await drawBlob(original.current);
    history.current = [];
    setRepairCount(0);
    clearMask();
  };

  const apply = async () => {
    const base = baseCanvas.current;
    const mask = maskCanvas.current;
    if (!base || !mask || strokes.current.length === 0 || busy) return;
    setBusy(true);
    setError(false);
    setBusyText(copy.engineLoading);
    try {
      // 修复前留一份快照，修坏了能退回来
      const before = await snapshot();
      // 引擎加载完立刻切换文案
      const timer = setTimeout(() => setBusyText(copy.applying), 400);
      const result = await inpaintImage(base, mask);
      clearTimeout(timer);
      const bitmap = await createImageBitmap(result);
      base.getContext("2d")!.drawImage(bitmap, 0, 0);
      bitmap.close();
      if (before) {
        history.current.push(before);
        if (history.current.length > MAX_HISTORY) history.current.shift();
        setRepairCount(history.current.length);
      }
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

          <div className={`${style.workspace} ${dragging ? style.dropTarget : ""}`}>
            {dragging && (
              <div className={style.dropOverlay}>
                <span>松手就换成这张图</span>
              </div>
            )}
            {mode === "idle" && (
              <button
                type="button"
                className={`${style.dropzone} ${dragging ? style.dragOver : ""}`}
                onClick={() => fileInput.current?.click()}
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

                <p className={style.notice}>
                  {size ? `${size.width} × ${size.height}` : ""}
                  {repairCount > 0 ? ` · ${copy.repaired(repairCount)}` : ""}
                  {strokeCount === 0 && repairCount === 0 ? ` · ${copy.strokeHint}` : ""}
                </p>

                {error && <p className={style.stageError}>{copy.failed}</p>}

                <div className={style.resultActions}>
                  <button type="button" className="button" disabled={busy || strokeCount === 0} onClick={undoStroke}>
                    <Undo2 size={16} />{copy.undoStroke}
                  </button>
                  <button type="button" className="button" disabled={busy || strokeCount === 0} onClick={clearMask}>
                    <Eraser size={16} />{copy.clear}
                  </button>
                  <button type="button" className="button" disabled={busy || repairCount === 0} onClick={undoRepair}>
                    <History size={16} />{copy.undoRepair}
                  </button>
                  <button type="button" className="button" disabled={busy || repairCount === 0} onClick={restoreOriginal}>
                    <RotateCcw size={16} />{copy.restore}
                  </button>
                  <button type="button" className="button" disabled={busy} onClick={reset}>
                    <ImagePlus size={16} />{copy.again}
                  </button>
                  <button type="button" className="button" disabled={busy} onClick={download}>
                    <Download size={16} />{copy.download}
                  </button>
                  <button type="button" className="button buttonPrimary" disabled={busy || strokeCount === 0} onClick={apply}>
                    <Wand2 size={16} />{error ? copy.retry : copy.apply}
                  </button>
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
