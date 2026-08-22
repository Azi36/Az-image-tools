import { useEffect, useRef, useState } from "react";
import { getFilesFromDataTransfer } from "@/functions";

/**
 * 整页接收拖入的图片。
 *
 * 之前 AI 三页只有中间那块 dropzone 能接住文件，拖到页面别处就掉地上、
 * 而且浏览器会直接打开这张图，等于把用户的工作弄丢。
 *
 * 返回是否正在拖拽，用来给界面加高亮。
 */
export function useImageDrop(
  onFile: (file: File) => void,
  enabled: boolean = true,
): boolean {
  const [dragging, setDragging] = useState(false);
  // 回调每次渲染都是新的，用 ref 存最新的，省得反复解绑重绑
  const handler = useRef(onFile);
  useEffect(() => {
    handler.current = onFile;
  });

  useEffect(() => {
    if (!enabled) {
      setDragging(false);
      return;
    }

    // dragenter/dragleave 在子元素之间穿梭时会成对乱飞，用计数器才稳
    let depth = 0;

    const onDragEnter = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes("Files")) return;
      depth += 1;
      setDragging(true);
    };
    const onDragOver = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes("Files")) return;
      // 不拦下来的话浏览器会直接打开这张图
      event.preventDefault();
    };
    const onDragLeave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onDrop = (event: DragEvent) => {
      depth = 0;
      setDragging(false);
      const file = Array.from(event.dataTransfer?.files ?? []).find((item) =>
        item.type.startsWith("image/"),
      );
      if (!file) return;
      event.preventDefault();
      handler.current(file);
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [enabled]);

  return dragging;
}

/** 按下某个键时触发，enabled 为假时不绑定 */
export function useHotkey(
  key: string,
  onPress: () => void,
  enabled: boolean = true,
) {
  const handler = useRef(onPress);
  useEffect(() => {
    handler.current = onPress;
  });

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== key) return;
      handler.current();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [key, enabled]);
}

/**
 * 整页接收拖入的文件（多选 + 文件夹）。
 *
 * 和 useImageDrop 的区别：那个是 AI 三页用的，只要一张图；这里是压缩页，
 * 要把文件夹展开成整批。监听挂在 window 上而不是某个 dropzone 元素上——
 * 列表非空时 UploadCard 已经卸载了，挂在它身上等于没挂，浏览器会接管
 * 这次 drop 直接把图片打开，页面上的整批结果就没了。
 */
export function useFilesDrop(
  onFiles: (files: Array<File>) => void,
  enabled: boolean = true,
): boolean {
  const [dragging, setDragging] = useState(false);
  const handler = useRef(onFiles);
  useEffect(() => {
    handler.current = onFiles;
  });

  useEffect(() => {
    if (!enabled) {
      setDragging(false);
      return;
    }

    let depth = 0;
    const hasFiles = (event: DragEvent) =>
      Boolean(event.dataTransfer?.types.includes("Files"));

    const onDragEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth += 1;
      setDragging(true);
    };
    const onDragOver = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };
    const onDragLeave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onDrop = (event: DragEvent) => {
      depth = 0;
      setDragging(false);
      if (!hasFiles(event)) return;
      event.preventDefault();
      const { dataTransfer } = event;
      void getFilesFromDataTransfer(dataTransfer).then((files) => {
        if (files.length > 0) handler.current(files);
      });
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [enabled]);

  return dragging;
}
