import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { observer } from "mobx-react-lite";
import { FilePlus2, Layers, Replace } from "lucide-react";
import { sprintf } from "sprintf-js";
import style from "./index.module.scss";
import { gstate } from "@/global";

type DropConfirmProps = {
  /** 这次拖进来几个文件 */
  incoming: number;
  /** 列表里已经有几张 */
  existing: number;
  onAppend: () => void;
  onReplace: () => void;
  onCancel: () => void;
};

/**
 * 列表里已经有图时又拖进来一批，问一句是加进去还是换掉。
 *
 * 直接追加会让人分不清哪些是刚拖的，直接替换又会把已经压好的结果扔了，
 * 两种都不能替用户决定。
 */
export const DropConfirm = observer(({ incoming, existing, onAppend, onReplace, onCancel }: DropConfirmProps) => {
  const locale = gstate.locale?.dropConfirm;
  const appendRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    appendRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return createPortal(
    <div className={style.backdrop} role="dialog" aria-modal="true">
      <div className={style.panel}>
        <div className={style.icon}><Layers size={22} /></div>
        <strong>{locale?.title}</strong>
        <p>{sprintf(locale?.description ?? "", incoming, existing)}</p>
        <div className={style.actions}>
          <button ref={appendRef} type="button" className="button buttonPrimary" onClick={onAppend}>
            <FilePlus2 size={17} />
            {locale?.append}
          </button>
          <button type="button" className="button" onClick={onReplace}>
            <Replace size={17} />
            {locale?.replace}
          </button>
          <button type="button" className="button" onClick={onCancel}>{locale?.cancel}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
});
