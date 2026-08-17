import { useState } from "react";
import { createPortal } from "react-dom";
import { observer } from "mobx-react-lite";
import { observable } from "mobx";
import { Check, RotateCcw, X } from "lucide-react";
import style from "./index.module.scss";
import { CompressOption } from "@/components/CompressOption";
import { gstate } from "@/global";
import { homeState } from "@/states/home";
import { normalizeCompressOption } from "@/options";

/**
 * 单张图的参数覆盖。
 *
 * 整批共用一套参数时，想把某一张单独压狠一点就只能把全局改了、全部重压。
 * 这里给这张图一份独立设置，改完只重压它自己。
 */
export const ItemOption = observer(() => {
  const key = homeState.editingKey;
  const item = key === null ? undefined : homeState.list.get(key);

  // 草稿是独立的 observable 副本：没点「应用」之前不碰原图的设置
  const [draft] = useState(() =>
    observable(
      normalizeCompressOption(
        item?.option ? { ...item.option } : { ...homeState.option },
      ),
    ),
  );

  if (key === null || !item) return null;

  const close = () => {
    homeState.editingKey = null;
  };

  const apply = () => {
    homeState.setItemOption(key, normalizeCompressOption(draft));
    close();
  };

  const backToGlobal = () => {
    homeState.setItemOption(key, undefined);
    close();
  };

  return createPortal(
    <div className={style.backdrop} role="dialog" aria-modal="true">
      <div className={style.panel}>
        <header className={style.header}>
          <div>
            <strong>{gstate.locale?.itemOption.title}</strong>
            <span title={item.name}>{item.name}</span>
          </div>
          <button
            type="button"
            className={style.close}
            aria-label={gstate.locale?.itemOption.cancel}
            onClick={close}
          >
            <X size={20} />
          </button>
        </header>

        <p className={style.hint}>{gstate.locale?.itemOption.hint}</p>

        <div className={style.scroll}>
          {/* 整批还在跑也允许改这一张，反正只影响它自己 */}
          <CompressOption value={draft} editable />
        </div>

        <footer className={style.footer}>
          {item.option && (
            <button type="button" className="button" onClick={backToGlobal}>
              <RotateCcw size={17} />
              {gstate.locale?.itemOption.useGlobal}
            </button>
          )}
          <button type="button" className="button" onClick={close}>
            {gstate.locale?.itemOption.cancel}
          </button>
          <button type="button" className="button buttonPrimary" onClick={apply}>
            <Check size={17} />
            {gstate.locale?.itemOption.apply}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
});
