import style from "./index.module.scss";
import { observer } from "mobx-react-lite";

interface LogoProps {
  iconSize?: number;
  title?: string;
  /** 小屏只留图标。页头空间紧张要开，页脚有的是地方，默认关 */
  compact?: boolean;
}

/**
 * Az-im 站标：Azi36 家族血统的图片站变体
 * 主站是「山峰 A + 小太阳」，图片站是「山峦 + 小太阳」——
 * 经典图片图标的构图，一眼认出是一家人
 */
export const Logo = observer(({ iconSize = 26, title = "Az-im", compact = false }: LogoProps) => {
  return (
    <div className={style.container} aria-label={title}>
      <span
        className={style.icon}
        style={{ width: iconSize, height: iconSize }}
      >
        <svg viewBox="0 0 48 48" aria-hidden="true">
          {/* 两座山底部相接、互不穿插：小山在左，大山在右 */}
          <path
            d="M6.5 34l7-9.5 7 9.5"
            style={{ "--len": 24 } as React.CSSProperties}
            fill="none"
            stroke="#fff"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M20.5 34 30.5 15l10 19"
            style={{ "--len": 43 } as React.CSSProperties}
            fill="none"
            stroke="#fff"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="12.5" cy="13.5" r="3.4" fill="#ffb02e" />
        </svg>
      </span>
      <span className={compact ? `${style.wordmark} ${style.compact}` : style.wordmark}>
        Az<b>im</b>
      </span>
    </div>
  );
});
