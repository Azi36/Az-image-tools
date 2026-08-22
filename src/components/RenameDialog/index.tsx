import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { observer } from "mobx-react-lite";
import { Check, RotateCcw, X } from "lucide-react";
import style from "./index.module.scss";
import { gstate } from "@/global";
import { homeState } from "@/states/home";
import { Select } from "@/components/Select";
import { Collapsible } from "@/components/Collapsible";
import {
  DefaultRenameRule,
  normalizeRenameRule,
  RENAME_TOKENS,
  type RenameCase,
  type RenameExtCase,
  type RenameRule,
} from "@/rename";
import { toJS } from "mobx";

/** 预览列出多少条就够看出规律了，全列出来几百行没人翻 */
const PREVIEW_LIMIT = 6;

function isValidRegex(rule: RenameRule) {
  if (!rule.regex || !rule.find) return true;
  try {
    new RegExp(rule.find);
    return true;
  } catch {
    return false;
  }
}

/**
 * 批量重命名。
 *
 * 规则只作用于主名，扩展名跟着每张图实际的输出格式走——同一批里有 PNG
 * 也有转成 WebP 的，写死扩展名就会存出一堆打不开的文件。需要分格式区别
 * 对待时用「分格式模板」，比通用模板优先。
 */
export const RenameDialog = observer(() => {
  const locale = gstate.locale?.rename;
  const [rule, setRule] = useState<RenameRule>(() =>
    normalizeRenameRule(toJS(homeState.renameRule)),
  );
  const patternRef = useRef<HTMLInputElement>(null);

  const patch = (part: Partial<RenameRule>) => setRule((prev) => ({ ...prev, ...part }));
  /** 输入框清空时 Number("") 是 0、删到只剩负号是 NaN，都不能直接塞回受控 input */
  const numberOf = (raw: string, fallback: number) => {
    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
  };
  const close = () => { homeState.showRename = false; };

  const apply = () => {
    homeState.setRenameRule(rule);
    close();
  };

  // 变量点一下插到光标处，比让人照着文档手打靠谱
  const insertToken = (token: string) => {
    const input = patternRef.current;
    const text = `{${token}}`;
    if (!input) {
      patch({ pattern: rule.pattern + text });
      return;
    }
    const start = input.selectionStart ?? rule.pattern.length;
    const end = input.selectionEnd ?? start;
    const next = rule.pattern.slice(0, start) + text + rule.pattern.slice(end);
    patch({ pattern: next });
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start + text.length, start + text.length);
    });
  };

  // 预览用的是草稿规则，所见即所得；enabled 关着的时候也预览一下，
  // 不然要先勾上才能看见效果，很别扭
  const previewNames = homeState.getOutputNames({ ...rule, enabled: true });
  const preview = Array.from(homeState.list.values())
    .slice(0, PREVIEW_LIMIT)
    .map((item) => ({
      key: item.key,
      from: item.name,
      to: previewNames.get(item.key) ?? item.name,
    }));
  const formats = homeState.getOutputFormats();
  const regexOk = isValidRegex(rule);

  const caseOptions: Array<{ value: RenameCase; label: string }> = [
    { value: "keep", label: locale?.caseKeep ?? "" },
    { value: "lower", label: locale?.caseLower ?? "" },
    { value: "upper", label: locale?.caseUpper ?? "" },
    { value: "capitalize", label: locale?.caseCapitalize ?? "" },
  ];
  const extCaseOptions: Array<{ value: RenameExtCase; label: string }> = [
    { value: "lower", label: locale?.extLower ?? "" },
    { value: "upper", label: locale?.extUpper ?? "" },
  ];

  return createPortal(
    <div className={style.backdrop} role="dialog" aria-modal="true">
      <div className={style.panel}>
        <header className={style.header}>
          <div>
            <strong>{locale?.title}</strong>
            <span>{locale?.hint}</span>
          </div>
          <button type="button" className={style.close} aria-label={locale?.cancel} onClick={close}>
            <X size={20} />
          </button>
        </header>

        <div className={style.scroll}>
          <label className={style.switchField}>
            <input
              type="checkbox"
              checked={rule.enabled}
              onChange={(event) => patch({ enabled: event.target.checked })}
            />
            <span>{locale?.enable}</span>
          </label>

          <div className={style.field}>
            <span className={style.fieldLabel}>{locale?.pattern}</span>
            <input
              ref={patternRef}
              className={style.text}
              value={rule.pattern}
              maxLength={120}
              spellCheck={false}
              placeholder={DefaultRenameRule.pattern}
              onChange={(event) => patch({ pattern: event.target.value })}
            />
            <div className={style.tokens}>
              {RENAME_TOKENS.map((token) => (
                <button
                  key={token}
                  type="button"
                  title={locale?.tokenDesc?.[token]}
                  onClick={() => insertToken(token)}
                >
                  {`{${token}}`}
                  <small>{locale?.tokenDesc?.[token]}</small>
                </button>
              ))}
            </div>
          </div>

          <div className={style.field}>
            <span className={style.fieldLabel}>{locale?.numbering}</span>
            <div className={style.triple}>
              <label>
                <span>{locale?.start}</span>
                <input type="number" min={0} max={999999} value={rule.start} onChange={(event) => patch({ start: numberOf(event.target.value, 0) })} />
              </label>
              <label>
                <span>{locale?.step}</span>
                <input type="number" min={1} max={1000} value={rule.step} onChange={(event) => patch({ step: numberOf(event.target.value, 1) })} />
              </label>
              <label>
                <span>{locale?.padding}</span>
                <input type="number" min={1} max={8} value={rule.padding} onChange={(event) => patch({ padding: numberOf(event.target.value, 1) })} />
              </label>
            </div>
          </div>

          <div className={style.field}>
            <span className={style.fieldLabel}>{locale?.findReplace}</span>
            <div className={style.pair}>
              <input className={style.text} value={rule.find} maxLength={200} spellCheck={false} placeholder={locale?.find} onChange={(event) => patch({ find: event.target.value })} />
              <input className={style.text} value={rule.replace} maxLength={200} spellCheck={false} placeholder={locale?.replace} onChange={(event) => patch({ replace: event.target.value })} />
            </div>
            <label className={style.checkField}>
              <input type="checkbox" checked={rule.regex} onChange={(event) => patch({ regex: event.target.checked })} />
              <span>{locale?.regex}</span>
            </label>
            {!regexOk && <p className={style.warning}>{locale?.regexInvalid}</p>}
          </div>

          <div className={style.field}>
            <span className={style.fieldLabel}>{locale?.caseLabel}</span>
            <div className={style.pair}>
              <label className={style.selectField}>
                <span>{locale?.nameCase}</span>
                <Select value={rule.nameCase} options={caseOptions} onChange={(value) => patch({ nameCase: value as RenameCase })} />
              </label>
              <label className={style.selectField}>
                <span>{locale?.extCase}</span>
                <Select value={rule.extCase} options={extCaseOptions} onChange={(value) => patch({ extCase: value as RenameExtCase })} />
              </label>
            </div>
          </div>

          {formats.length > 0 && (
            <div className={style.group}>
              <Collapsible title={locale?.perFormat ?? ""} summary={formats.join(" / ")} marked={Object.keys(rule.perFormat).length > 0}>
                <p className={style.note}>{locale?.perFormatHint}</p>
                <div className={style.formatGrid}>
                  {formats.map((format) => (
                    <label key={format}>
                      <span>{format.toUpperCase()}</span>
                      <input
                        className={style.text}
                        value={rule.perFormat[format] ?? ""}
                        maxLength={120}
                        spellCheck={false}
                        placeholder={rule.pattern}
                        onChange={(event) => {
                          const next = { ...rule.perFormat };
                          if (event.target.value.trim()) next[format] = event.target.value;
                          else delete next[format];
                          patch({ perFormat: next });
                        }}
                      />
                    </label>
                  ))}
                </div>
              </Collapsible>
            </div>
          )}

          <div className={style.field}>
            <span className={style.fieldLabel}>{locale?.preview}</span>
            {preview.length === 0 ? (
              <p className={style.note}>{locale?.previewEmpty}</p>
            ) : (
              <ul className={style.preview}>
                {preview.map((row) => (
                  <li key={row.key}>
                    <span title={row.from}>{row.from}</span>
                    <b title={row.to}>{row.to}</b>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <footer className={style.footer}>
          <button type="button" className="button" onClick={() => setRule(structuredClone(DefaultRenameRule))}>
            <RotateCcw size={17} />
            {locale?.reset}
          </button>
          <button type="button" className="button" onClick={close}>{locale?.cancel}</button>
          <button type="button" className="button buttonPrimary" onClick={apply}>
            <Check size={17} />
            {locale?.apply}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
});
