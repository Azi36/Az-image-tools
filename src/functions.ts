import { filesize } from "filesize";
import { Mimes } from "./mimes";
import type { ImageItem } from "./states/home";
import type { CompressOption } from "./engines/ImageBase";

/**
 * Normalize pathname
 * @param pathname
 * @param base
 * @returns
 */
export function normalize(pathname: string, base = "/") {
  // Ensure starts with '/'
  pathname = "/" + pathname.replace(/^\/*/, "");
  base = "/" + base.replace(/^\/*/, "");
  if (!pathname.startsWith(base)) return "error404";
  return pathname.substring(base.length).replace(/^\/*|\/*$/g, "");
}

/**
 * Globaly uniqid in browser session lifecycle
 */
let __UniqIdIndex = 0;
export function uniqId() {
  __UniqIdIndex += 1;
  return __UniqIdIndex;
}

/**
 * Beautify byte size
 * @param num byte size
 * @returns
 */
export function formatSize(num: number) {
  const result = filesize(num, { standard: "jedec", output: "array" });
  return result[0] + " " + result[1];
}

/**
 * Create a download dialog from browser
 * @param name
 * @param blob
 */
export function createDownload(name: string, blob: Blob) {
  const anchor = document.createElement("a");
  const url = URL.createObjectURL(blob);
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  anchor.remove();
  // Release the temporary object URL right after the click.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * If names Set already has name, add suffix '(1)' for the name
 * which will newly pushed to names set
 *
 * @param names will checked names Set
 * @param name will pushed to names
 */
export function getUniqNameOnNames(names: Set<string>, name: string): string {
  let checkName = name;
  let attempts = 0;
  const maxAttempts = 100;

  while (names.has(checkName) && attempts < maxAttempts) {
    const nameParts = checkName.split(".");
    const extension = nameParts.pop();
    checkName = nameParts.join("") + "(1)." + extension;
    attempts++;
  }

  if (names.has(checkName)) {
    const nameParts = name.split(".");
    const extension = nameParts.pop();
    checkName = nameParts.join("") + "(" + Date.now() + ")." + extension;
  }

  return checkName;
}

/**
 * Wait some time
 * @param millisecond
 * @returns
 */
export async function wait(millisecond: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, millisecond);
  });
}

/**
 * Preload image by src
 * @param src
 */
export async function preloadImage(src: string) {
  return new Promise<void>((resolve) => {
    const img = new Image();
    img.src = src;
    img.onload = () => resolve();
    img.onerror = () => resolve();
  });
}

export function isSupportedType(file: File): boolean {
  if (Object.values(Mimes).includes(file.type)) return true;
  const ext = file.name.split(".").pop()?.toLowerCase();
  return ext ? Object.keys(Mimes).includes(ext) : false;
}

/**
 * Get file list from FileSystemEntry
 * @param entry
 * @returns
 */
export async function getFilesFromEntry(
  entry: FileSystemEntry,
): Promise<Array<File>> {
  // If entry is a file
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry;
    return new Promise<Array<File>>((resolve) => {
      // 不在这里过滤：统一交给 createImageList，才能统计出「忽略了几个」
      fileEntry.file((result) => resolve([result]), () => []);
    });
  }

  // If entry is a directory
  if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry;
    const list = await new Promise<Array<FileSystemEntry>>((resolve) => {
      dirEntry.createReader().readEntries(resolve, () => []);
    });
    const result: Array<File> = [];
    for (const item of list) {
      const subList = await getFilesFromEntry(item);
      result.push(...subList);
    }
    return result;
  }

  // Otherwise
  return [];
}

/**
 * Get file list from FileSystemHandle
 * @param entry
 * @returns
 */
export async function getFilesFromHandle(
  handle: FileSystemHandle,
): Promise<Array<File>> {
  // If handle is a file
  if (handle.kind === "file") {
    const fileHandle = handle as FileSystemFileHandle;
    const file = await fileHandle.getFile();
    return [file];
  }

  // If handle is a directory
  if (handle.kind === "directory") {
    const result: Array<File> = [];
    for await (const item of (handle as any).values()) {
      const subList = await getFilesFromHandle(item);
      result.push(...subList);
    }
    return result;
  }

  return [];
}

/**
 * Get file suffix by lowercase
 * @param fileName
 */
export function splitFileName(fileName: string) {
  const index = fileName.lastIndexOf(".");
  // No extension: keep the whole name, empty suffix.
  if (index <= 0) {
    return { name: fileName, suffix: "" };
  }
  const name = fileName.substring(0, index);
  const suffix = fileName.substring(index + 1).toLowerCase();
  return { name, suffix };
}

/**
 * Get final file name if there exists a type convert
 * @param item
 * @param option
 * @returns
 */
export function getOutputFileName(item: ImageItem, option: CompressOption) {
  if (!item.compress || item.blob.type === item.compress.blob.type) {
    return item.name;
  }

  const { name, suffix } = splitFileName(item.name);
  let resultSuffix = suffix;
  for (const key in Mimes) {
    if (item.compress.blob.type === Mimes[key]) {
      resultSuffix = key;
      break;
    }
  }

  if (["jpg", "jpeg"].includes(resultSuffix)) {
    resultSuffix = option.format.target?.toLowerCase() || resultSuffix;
  }

  return name + "." + resultSuffix;
}

/**
 * Get files from clipboard paste event
 * @param event ClipboardEvent
 * @returns Array of File objects
 */
export async function getFilesFromClipboard(event: ClipboardEvent): Promise<Array<File>> {
  const files: Array<File> = [];
  
  if (!event.clipboardData) {
    return files;
  }

  const items = event.clipboardData.items;
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    
    // Check if the item is an image
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file && isSupportedType(file)) {
        files.push(file);
      }
    }
  }
  
  return files;
}

/**
 * Check if clipboard contains image data
 * @param event ClipboardEvent
 * @returns boolean
 */
export function hasImageInClipboard(event: ClipboardEvent): boolean {
  if (!event.clipboardData) {
    return false;
  }
  
  const items = event.clipboardData.items;
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type.startsWith('image/')) {
      return true;
    }
  }
  
  return false;
}

/**
 * 浏览器是否支持把图片写进剪贴板
 * （Firefox 到目前为止只支持写文本，所以按钮要按能力显示）
 */
export function canCopyImage(): boolean {
  return (
    typeof ClipboardItem !== "undefined" &&
    typeof navigator !== "undefined" &&
    Boolean(navigator.clipboard?.write)
  );
}

/**
 * 把图片写进剪贴板，返回是否成功
 * 注意：必须在用户手势的调用栈里执行，否则浏览器会拒绝
 */
export async function copyImageToClipboard(blob: Blob): Promise<boolean> {
  if (!canCopyImage()) return false;
  try {
    // 剪贴板对 PNG 支持最好，其它格式先转一道
    let payload = blob;
    if (blob.type !== "image/png") {
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
      bitmap.close();
      payload = await canvas.convertToBlob({ type: "image/png" });
    }
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": payload }),
    ]);
    return true;
  } catch (error) {
    console.error("[Az-im] copy to clipboard failed:", error);
    return false;
  }
}

/**
 * 等比缩小到长边不超过 maxEdge，返回 PNG Blob
 * 已经在范围内就原样返回
 */
export async function shrinkImage(blob: Blob, maxEdge: number): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const longEdge = Math.max(bitmap.width, bitmap.height);
  if (longEdge <= maxEdge) {
    bitmap.close();
    return blob;
  }

  const rate = maxEdge / longEdge;
  const width = Math.max(1, Math.round(bitmap.width * rate));
  const height = Math.max(1, Math.round(bitmap.height * rate));
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d")!;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas.convertToBlob({ type: "image/png" });
}
