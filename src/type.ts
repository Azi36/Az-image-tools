export interface LocaleData {
  logo: string;
  siteTitle: string;
  siteDescription: string;
  initial: string;
  previewHelp: string;
  heif: {
    previewUnavailable: string;
    originalPreserved: string;
  };
  errors: {
    animatedUnsupported: string;
    unsupportedType: string;
    processCrashed: string;
  };
  notice: {
    ignoredFiles: string;
    largeFiles: string;
    duplicates: string;
    stopped: string;
  };
  error404: {
    backHome: string;
    description: string;
  };
  uploadCard: {
    title: string;
    subTitle: string;
    pasteHint: string;
  };
  listAction: {
    batchAppend: string;
    addFolder: string;
    rename: string;
    clear: string;
    downloadAll: string;
    downloadOne: string;
    removeOne: string;
    reCompress: string;
    stop: string;
    packing: string;
  };
  dropConfirm: {
    overlay: string;
    title: string;
    /** %1$d 新拖入的文件数，%2$d 列表里已有的图片数 */
    description: string;
    append: string;
    replace: string;
    cancel: string;
  };
  rename: {
    title: string;
    hint: string;
    enable: string;
    pattern: string;
    numbering: string;
    start: string;
    step: string;
    padding: string;
    findReplace: string;
    find: string;
    replace: string;
    regex: string;
    regexInvalid: string;
    caseLabel: string;
    nameCase: string;
    extCase: string;
    caseKeep: string;
    caseLower: string;
    caseUpper: string;
    caseCapitalize: string;
    extLower: string;
    extUpper: string;
    perFormat: string;
    perFormatHint: string;
    preview: string;
    previewEmpty: string;
    apply: string;
    cancel: string;
    reset: string;
    /** 键是 RENAME_TOKENS 里的占位符名 */
    tokenDesc: Record<string, string>;
  };
  /** 折叠面板收起时的一行摘要用的短词 */
  summary: {
    none: string;
    unset: string;
    keepFormat: string;
    width: string;
    height: string;
    short: string;
    long: string;
    crop: string;
    quality: string;
    colors: string;
    dithering: string;
    speed: string;
    extreme: string;
    on: string;
    off: string;
  };
  columnTitle: {
    status: string;
    name: string;
    preview: string;
    size: string;
    newSize: string;
    dimension: string;
    newDimension: string;
    decrease: string;
    action: string;
  };
  optionPannel: {
    resizeLable: string;
    jpegLable: string;
    pngLable: string;
    gifLable: string;
    avifLable: string;
    avifQuality: string;
    avifSpeed: string;
    help: string;
    failTip: string;
    resizePlaceholder: string;
    fitWidth: string;
    fitHeight: string;
    // Optional so locales can fall back to English until translated
    scalePercent?: string;
    percentPlaceholder?: string;
    quickSizes?: string;
    setShort: string;
    setLong: string;
    setCropRatio: string;
    setCropSize: string;
    widthPlaceholder: string;
    heightPlaceholder: string;
    shortPlaceholder: string;
    longPlaceholder: string;
    cwRatioPlaceholder: string;
    chRatioPlaceholder: string;
    cwSizePlaceholder: string;
    chSizePlaceholder: string;
    cropCompareWarning: string;
    presetCrop: string;
    presetPaperSize: string;
    presetOrientation: string;
    presetPortrait: string;
    presetLandscape: string;
    presetRefWidth: string;
    presetRefHeight: string;
    presetCropPx: string;
    presetOffsetPx: string;
    presetCropWarning: string;
    presetSwitchRef: string;
    presetCancelCrop: string;
    qualityTitle: string;
    extremeMode: string;
    extremeModeHint: string;
    resetBtn: string;
    confirmBtn: string;
    colorsDesc: string;
    pngDithering: string;
    gifDithering: string;
    outputFormat: string;
    outputFormatPlaceholder: string;
    transparentFillDesc: string;
  };
  presets: {
    label: string;
    save: string;
    namePlaceholder: string;
    confirm: string;
    cancel: string;
    remove: string;
    custom: string;
    limitReached: string;
    saved: string;
    names: {
      default: string;
      wechat: string;
      blog: string;
      sharp: string;
      extreme: string;
    };
  };
  itemOption: {
    title: string;
    hint: string;
    open: string;
    apply: string;
    cancel: string;
    useGlobal: string;
    badge: string;
  };
  listFilter: {
    all: string;
    error: string;
    cancelled: string;
    larger: string;
    sortLabel: string;
    sortDefault: string;
    sortSize: string;
    sortRate: string;
    empty: string;
  };
  progress: {
    before: string;
    after: string;
    rate: string;
  };
}
