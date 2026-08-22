import { observer } from "mobx-react-lite";
import style from "./index.module.scss";
import { homeState } from "@/states/home";
import { gstate } from "@/global";
import { getImageMime, Mimes, OutputFormats } from "@/mimes";
import { MAX_CANVAS_DIMENSION, PAPER_SIZES } from "@/engines/ImageBase";
import { Select } from "@/components/Select";
import { Collapsible } from "@/components/Collapsible";
import { DefaultCompressOption, getCompressionOptionVisibility } from "@/options";
import type { CompressOption as CompressOptionValue } from "@/engines/ImageBase";

type ResizeMethod = CompressOptionValue["resize"]["method"];

// 固定尺寸裁剪的快捷预设：常用交付尺寸一键填入
const quickSizeData = [
  { label: "公众号封面", width: 900, height: 383 },
  { label: "方图", width: 1080, height: 1080 },
  { label: "小红书 3:4", width: 1242, height: 1656 },
  { label: "B站封面", width: 1146, height: 717 },
  { label: "竖屏 9:16", width: 1080, height: 1920 },
  { label: "全高清 16:9", width: 1920, height: 1080 },
];

type NumberFieldProps = {
  value?: number;
  min?: number;
  max?: number;
  placeholder?: string;
  disabled: boolean;
  onChange: (value?: number) => void;
};

function NumberField({ value, min = 0, max = MAX_CANVAS_DIMENSION, placeholder, disabled, onChange }: NumberFieldProps) {
  return (
    <input type="number" value={value ?? ""} min={min} max={max} step={1} placeholder={placeholder} disabled={disabled} onChange={(event) => { const nextValue = event.target.value; onChange(nextValue === "" ? undefined : Number(nextValue)); }} />
  );
}

type RangeFieldProps = {
  label?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
  onChange: (value: number) => void;
};

function RangeField({ label, value, min, max, step, disabled, onChange }: RangeFieldProps) {
  return (
    <label className={style.rangeField}>
      <span>{label}<b>{value}</b></span>
      <input type="range" value={value} min={min} max={max} step={step} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

type CompressOptionProps = {
  /** 要编辑的设置对象，默认是全局草稿；单张图调参时传那张图自己的副本 */
  value?: CompressOptionValue;
  /** 单张图调参时即便整批在跑也允许编辑 */
  editable?: boolean;
};

export const CompressOption = observer(({ value, editable }: CompressOptionProps = {}) => {
  const option = value ?? homeState.tempOption;
  const disabled = editable ? false : homeState.hasTaskRunning();
  const locale = gstate.locale?.optionPannel;
  const brief = gstate.locale?.summary;
  const resize = option.resize;
  const resizeMethod = resize.method;
  const targetFormat = option.format.target;
  const sourceMimes = Array.from(homeState.list.values(), (item) =>
    getImageMime({ name: item.name, type: item.blob.type })
  );
  const optionVisibility = getCompressionOptionVisibility(
    sourceMimes,
    targetFormat,
  );
  const showJpegOptions = optionVisibility.jpeg;
  const showPngOptions = optionVisibility.png;
  const showGifOptions = optionVisibility.gif;
  const showAvifOptions = optionVisibility.avif;
  const showJpegExtreme = targetFormat
    ? Mimes[targetFormat] === Mimes.jpg
    : sourceMimes.length === 0 || sourceMimes.includes(Mimes.jpg);
  const preset = resizeMethod === "presetCrop"
    ? resize.presetCrop ?? { paperSize: "a4", orientation: "portrait" as const, reference: "width" as const, cropPx: 0, offsetPx: 0 }
    : null;

  const setResizeMethod = (method: ResizeMethod) => {
    option.resize = {
      method,
      width: undefined,
      height: undefined,
      percent: undefined,
      short: undefined,
      long: undefined,
      cropWidthRatio: undefined,
      cropHeightRatio: undefined,
      cropWidthSize: undefined,
      cropHeightSize: undefined,
      presetCrop: method === "presetCrop"
        ? { paperSize: "a4", orientation: "portrait", reference: "width", cropPx: 0, offsetPx: 0 }
        : undefined,
    };
  };

  const pairField = (first: React.ReactNode, separator: string, second: React.ReactNode) => (
    <div className={style.pairField}>{first}<span>{separator}</span>{second}</div>
  );

  const resizeOptions = [
    { value: "fitWidth", label: locale?.fitWidth ?? "" },
    { value: "fitHeight", label: locale?.fitHeight ?? "" },
    { value: "scalePercent", label: locale?.scalePercent ?? "Scale by percentage" },
    { value: "setShort", label: locale?.setShort ?? "" },
    { value: "setLong", label: locale?.setLong ?? "" },
    { value: "setCropRatio", label: locale?.setCropRatio ?? "" },
    { value: "setCropSize", label: locale?.setCropSize ?? "" },
    { value: "presetCrop", label: locale?.presetCrop ?? "" },
  ];

  let resizeField: React.ReactNode = null;
  if (resizeMethod === "fitWidth") {
    resizeField = <NumberField value={resize.width} disabled={disabled} placeholder={locale?.widthPlaceholder} onChange={(value) => { resize.width = value; }} />;
  } else if (resizeMethod === "fitHeight") {
    resizeField = <NumberField value={resize.height} disabled={disabled} placeholder={locale?.heightPlaceholder} onChange={(value) => { resize.height = value; }} />;
  } else if (resizeMethod === "scalePercent") {
    resizeField = <NumberField value={resize.percent} min={1} max={100} disabled={disabled} placeholder={locale?.percentPlaceholder ?? "Set scale percentage (1-100)"} onChange={(value) => { resize.percent = value; }} />;
  } else if (resizeMethod === "setShort") {
    resizeField = <NumberField value={resize.short} disabled={disabled} placeholder={locale?.shortPlaceholder} onChange={(value) => { resize.short = value; }} />;
  } else if (resizeMethod === "setLong") {
    resizeField = <NumberField value={resize.long} disabled={disabled} placeholder={locale?.longPlaceholder} onChange={(value) => { resize.long = value; }} />;
  } else if (resizeMethod === "setCropRatio") {
    resizeField = pairField(
      <NumberField value={resize.cropWidthRatio} min={1} disabled={disabled} placeholder={locale?.cwRatioPlaceholder} onChange={(value) => { resize.cropWidthRatio = value; }} />,
      ":",
      <NumberField value={resize.cropHeightRatio} min={1} disabled={disabled} placeholder={locale?.chRatioPlaceholder} onChange={(value) => { resize.cropHeightRatio = value; }} />,
    );
  } else if (resizeMethod === "setCropSize") {
    resizeField = pairField(
      <NumberField value={resize.cropWidthSize} min={1} disabled={disabled} placeholder={locale?.cwSizePlaceholder} onChange={(value) => { resize.cropWidthSize = value; }} />,
      "x",
      <NumberField value={resize.cropHeightSize} min={1} disabled={disabled} placeholder={locale?.chSizePlaceholder} onChange={(value) => { resize.cropHeightSize = value; }} />,
    );
  }

  let presetWarning = false;
  if (preset && homeState.list.size > 0) {
    for (const item of homeState.list.values()) {
      const paper = PAPER_SIZES[preset.paperSize];
      if (!paper) { presetWarning = true; break; }
      const ratioWidth = preset.orientation === "landscape" ? paper.height : paper.width;
      const ratioHeight = preset.orientation === "landscape" ? paper.width : paper.height;
      const referenceDimension = preset.reference === "width" ? item.width : item.height;
      const otherDimension = preset.reference === "width" ? item.height : item.width;
      const referenceRatio = preset.reference === "width" ? ratioWidth : ratioHeight;
      const otherRatio = preset.reference === "width" ? ratioHeight : ratioWidth;
      const cropPx = preset.cropPx ?? 0;
      const offsetPx = preset.offsetPx ?? 0;
      const remaining = referenceDimension - Math.max(0, cropPx + offsetPx) - Math.max(0, cropPx - offsetPx);
      if (remaining <= 0 || Math.round(remaining * otherRatio / referenceRatio) > otherDimension) {
        presetWarning = true;
        break;
      }
    }
  }

  // 收起时顶在标题右边的一行摘要：不展开也知道这一档现在是什么设置
  const unset = brief?.unset ?? "";
  const resizeSummary = (() => {
    if (!resizeMethod) return brief?.none ?? "";
    if (resizeMethod === "fitWidth") return `${brief?.width} ${resize.width ?? unset}`;
    if (resizeMethod === "fitHeight") return `${brief?.height} ${resize.height ?? unset}`;
    if (resizeMethod === "scalePercent") return resize.percent ? `${resize.percent}%` : unset;
    if (resizeMethod === "setShort") return `${brief?.short} ${resize.short ?? unset}`;
    if (resizeMethod === "setLong") return `${brief?.long} ${resize.long ?? unset}`;
    if (resizeMethod === "setCropRatio") return `${brief?.crop} ${resize.cropWidthRatio ?? unset}:${resize.cropHeightRatio ?? unset}`;
    if (resizeMethod === "setCropSize") return `${brief?.crop} ${resize.cropWidthSize ?? unset}×${resize.cropHeightSize ?? unset}`;
    const paper = preset ? PAPER_SIZES[preset.paperSize] : undefined;
    const orientation = preset?.orientation === "landscape" ? locale?.presetLandscape : locale?.presetPortrait;
    return `${paper?.label ?? ""} ${orientation ?? ""}`.trim();
  })();
  const formatSummary = targetFormat
    ? (targetFormat === "jpg" ? "JPEG" : targetFormat.toUpperCase())
    : brief?.keepFormat ?? "";
  const extremeTag = (on: boolean) => (on ? ` · ${brief?.extreme}` : "");

  return (
    <div className={style.container}>
      <Collapsible title={locale?.resizeLable ?? ""} summary={resizeSummary} marked={resizeMethod !== undefined}>
        <Select value={resizeMethod} options={resizeOptions} placeholder={locale?.resizePlaceholder} disabled={disabled} onChange={(value) => setResizeMethod(value as ResizeMethod)} onClear={() => setResizeMethod(undefined)} />
        {resizeField && <div className={style.fieldGap}>{resizeField}</div>}
        {resizeMethod === "setCropSize" && (
          <div className={style.quickSizes}>
            <span>{locale?.quickSizes ?? ""}</span>
            <div>
              {quickSizeData.map((size) => (
                <button key={size.label} type="button" disabled={disabled} onClick={() => { resize.cropWidthSize = size.width; resize.cropHeightSize = size.height; }}>
                  {size.label}
                  <small>{size.width}×{size.height}</small>
                </button>
              ))}
            </div>
          </div>
        )}
        {preset && (
          <div className={style.presetGrid}>
            <label><span>{locale?.presetPaperSize}</span><Select value={preset.paperSize} options={Object.entries(PAPER_SIZES).map(([value, paper]) => ({ value, label: paper.label }))} disabled={disabled} onChange={(value) => { preset.paperSize = value; }} /></label>
            <label><span>{locale?.presetOrientation}</span><Select value={preset.orientation} options={[{ value: "portrait", label: locale?.presetPortrait ?? "" }, { value: "landscape", label: locale?.presetLandscape ?? "" }]} disabled={disabled} onChange={(value) => { preset.orientation = value as "portrait" | "landscape"; }} /></label>
            <label><span>{locale?.presetRefWidth}</span><Select value={preset.reference} options={[{ value: "width", label: locale?.presetRefWidth ?? "" }, { value: "height", label: locale?.presetRefHeight ?? "" }]} disabled={disabled} onChange={(value) => { preset.reference = value as "width" | "height"; }} /></label>
            <label><span>{locale?.presetCropPx}</span><NumberField value={preset.cropPx} min={0} max={1000} disabled={disabled} onChange={(value) => { preset.cropPx = value; }} /></label>
            <label><span>{locale?.presetOffsetPx}</span><NumberField value={preset.offsetPx} min={-500} max={500} disabled={disabled} onChange={(value) => { preset.offsetPx = value; }} /></label>
            {presetWarning && <div className={style.warning}><span>{locale?.presetCropWarning}</span><button type="button" onClick={() => { preset.reference = preset.reference === "width" ? "height" : "width"; }}>{locale?.presetSwitchRef}</button><button type="button" onClick={() => setResizeMethod(undefined)}>{locale?.presetCancelCrop}</button></div>}
          </div>
        )}
      </Collapsible>

      <Collapsible title={locale?.outputFormat ?? ""} summary={formatSummary} marked={targetFormat !== undefined}>
        <Select value={option.format.target} options={OutputFormats.map((format) => ({ value: format, label: format === "jpg" ? "JPEG" : format.toUpperCase() }))} placeholder={locale?.outputFormatPlaceholder} disabled={disabled} onChange={(value) => { option.format.target = value as typeof option.format.target; }} onClear={() => { option.format.target = undefined; }} />
        {["jpg", "jpeg"].includes(option.format.target ?? "") && <label className={style.colorField}><span>{locale?.transparentFillDesc}</span><input type="color" disabled={disabled} value={option.format.transparentFill} onChange={(event) => { option.format.transparentFill = event.target.value.toUpperCase(); }} /></label>}
      </Collapsible>

      {showJpegOptions && <Collapsible title={locale?.jpegLable ?? ""} summary={`${brief?.quality} ${option.jpeg.quality}${extremeTag(option.jpeg.extreme)}`} marked={option.jpeg.quality !== DefaultCompressOption.jpeg.quality || option.jpeg.extreme}><RangeField label={locale?.qualityTitle} value={option.jpeg.quality} min={0} max={1} step={0.01} disabled={disabled} onChange={(value) => { option.jpeg.quality = value; }} />{showJpegExtreme && <label className={style.extremeField}><input type="checkbox" checked={option.jpeg.extreme} disabled={disabled} onChange={(event) => { option.jpeg.extreme = event.target.checked; }} /><span><b>{locale?.extremeMode}</b><small>{locale?.extremeModeHint}</small></span></label>}</Collapsible>}
      {showPngOptions && <Collapsible title={locale?.pngLable ?? ""} summary={`${option.png.colors} ${brief?.colors} · ${brief?.dithering} ${option.png.dithering}${extremeTag(option.png.extreme)}`} marked={option.png.colors !== DefaultCompressOption.png.colors || option.png.dithering !== DefaultCompressOption.png.dithering || option.png.extreme}><RangeField label={locale?.colorsDesc} value={option.png.colors} min={2} max={256} step={1} disabled={disabled} onChange={(value) => { option.png.colors = value; }} /><RangeField label={locale?.pngDithering} value={option.png.dithering} min={0} max={1} step={0.01} disabled={disabled} onChange={(value) => { option.png.dithering = value; }} /><label className={style.extremeField}><input type="checkbox" checked={option.png.extreme} disabled={disabled} onChange={(event) => { option.png.extreme = event.target.checked; }} /><span><b>{locale?.extremeMode}</b><small>{locale?.extremeModeHint}</small></span></label></Collapsible>}
      {showGifOptions && <Collapsible title={locale?.gifLable ?? ""} summary={`${option.gif.colors} ${brief?.colors} · ${brief?.dithering} ${option.gif.dithering ? brief?.on : brief?.off}`} marked={option.gif.colors !== DefaultCompressOption.gif.colors || option.gif.dithering}><label className={style.checkField}><input type="checkbox" checked={option.gif.dithering} disabled={disabled} onChange={(event) => { option.gif.dithering = event.target.checked; }} /><span>{locale?.gifDithering}</span></label><RangeField label={locale?.colorsDesc} value={option.gif.colors} min={2} max={256} step={1} disabled={disabled} onChange={(value) => { option.gif.colors = value; }} /></Collapsible>}
      {showAvifOptions && <Collapsible title={locale?.avifLable ?? ""} summary={`${brief?.quality} ${option.avif.quality} · ${brief?.speed} ${option.avif.speed}`} marked={option.avif.quality !== DefaultCompressOption.avif.quality || option.avif.speed !== DefaultCompressOption.avif.speed}><RangeField label={locale?.avifQuality} value={option.avif.quality} min={1} max={100} step={1} disabled={disabled} onChange={(value) => { option.avif.quality = value; }} /><RangeField label={locale?.avifSpeed} value={option.avif.speed} min={1} max={10} step={1} disabled={disabled} onChange={(value) => { option.avif.speed = value; }} /></Collapsible>}
    </div>
  );
});
