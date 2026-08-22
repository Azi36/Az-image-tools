import style from "./index.module.scss";
import { useRef } from "react";
import classNames from "classnames";
import { observer } from "mobx-react-lite";
import { gstate } from "@/global";
import { ImageInput } from "../ImageInput";
import { sprintf } from "sprintf-js";
import { Mimes } from "@/mimes";
import { Images, LockKeyhole } from "lucide-react";

/**
 * 空列表时的引导卡片。
 *
 * 拖拽本身由整页的监听接管（见 views/home），这里只负责点击选图和高亮，
 * 免得「有没有图」决定了「能不能拖进来」。
 */
export const UploadCard = observer(({ dragActive }: { dragActive?: boolean }) => {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className={classNames(style.container, dragActive && style.active)}>
      <div className={style.inner}>
        <div className={style.uploadIcon}>
          <Images aria-hidden="true" />
        </div>
        <strong>{gstate.locale?.uploadCard.title}</strong>
        <p>
          {sprintf(
            gstate.locale?.uploadCard.subTitle ?? "",
            Object.keys(Mimes)
              .map((item) => item.toUpperCase())
              .join("/"),
          )}
        </p>
        <div className={style.pasteHint}>
          <LockKeyhole size={16} aria-hidden="true" />
          <span>{gstate.locale?.uploadCard.pasteHint}</span>
        </div>
      </div>
      <ImageInput ref={fileRef} />
      <button
        type="button"
        className={style.mask}
        aria-label={gstate.locale?.uploadCard.title}
        onClick={() => {
          fileRef.current?.click();
        }}
      />
    </div>
  );
});
