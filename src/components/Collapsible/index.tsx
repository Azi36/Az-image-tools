import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import classNames from "classnames";
import style from "./index.module.scss";

type CollapsibleProps = {
  title: string;
  /** 收起时显示的当前值摘要，让人不用展开也知道这一档是什么设置 */
  summary?: string;
  defaultOpen?: boolean;
  /** 有非默认设置时给个小圆点，收起来也看得出这里被改过 */
  marked?: boolean;
  children: React.ReactNode;
};

/**
 * 参数分组的折叠面板。
 *
 * 选项面板一屏塞不下四五组编码参数，默认全收起来，用摘要顶在标题右边，
 * 需要调哪一组再展开。
 */
export function Collapsible({ title, summary, defaultOpen = false, marked, children }: CollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();

  return (
    <section className={classNames(style.section, open && style.open)}>
      <h4>
        <button
          type="button"
          className={style.head}
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((value) => !value)}
        >
          <span className={style.title}>
            {title}
            {marked && <i className={style.dot} aria-hidden="true" />}
          </span>
          {!open && summary && <span className={style.summary}>{summary}</span>}
          <ChevronDown className={style.chevron} size={16} aria-hidden="true" />
        </button>
      </h4>
      {open && (
        <div id={id} className={style.body}>
          {children}
        </div>
      )}
    </section>
  );
}
