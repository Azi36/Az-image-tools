import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { Moon, Sun } from "lucide-react";
import style from "./index.module.scss";
import { Logo } from "@/components/Logo";

// 与主站同款的主题切换：显式写入 azi-theme，深浅两态间切换
function getEffectiveTheme(): "dark" | "light" {
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "dark" || attr === "light") return attr;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

const ThemeToggle = () => {
  const [theme, setTheme] = useState<"dark" | "light" | null>(null);
  useEffect(() => setTheme(getEffectiveTheme()), []);
  const toggle = () => {
    const next = getEffectiveTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("azi-theme", next);
    } catch {}
    setTheme(next);
  };
  return (
    <button type="button" className={style.themeToggle} aria-label="切换深浅色" title="切换深浅色" onClick={toggle}>
      {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
};

// 站内工具导航：主页=回主站，其余是本站工具页，后面的工具进场再加
export const navItems = [
  { key: "main", label: "主页", href: "https://azi36.com" },
  { key: "compress", label: "图片压缩", href: "/" },
  { key: "matting", label: "背景移除", href: "/matting/" },
  { key: "upscale", label: "图片放大", href: "/upscale/" },
  { key: "inpaint", label: "去水印", href: "/inpaint/" },
];

type SiteHeaderProps = {
  active: string;
};

export const SiteHeader = observer(({ active }: SiteHeaderProps) => {
  return (
    <header className={style.header}>
      <a href="/" className={style.brand} aria-label="Az-im home"><Logo /></a>
      <nav className={style.mainNav} aria-label="站内导航">
        {navItems.map((item) => (
          <a
            key={item.key}
            href={item.href}
            className={item.key === active ? style.active : ""}
            aria-current={item.key === active ? "page" : undefined}
          >
            {item.label}
          </a>
        ))}
      </nav>
      <div className={style.navSide}>
        <span className={style.navStatus}><em>😊</em>Keep Smile ~</span>
        <ThemeToggle />
        <a className={style.navAvatar} href="https://github.com/Azi36" target="_blank" rel="noreferrer" aria-label="GitHub">
          <img src="/avatar.png" alt="Azi36" />
        </a>
      </div>
    </header>
  );
});
