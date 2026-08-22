import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { observer } from "mobx-react-lite";
import { Moon, Sun } from "lucide-react";
import style from "./index.module.scss";
import { Logo } from "@/components/Logo";
import { NavAvatar } from "@/components/NavAvatar";

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
    <button
      type="button"
      className={style.themeToggle}
      aria-label="切换深浅色"
      title="切换深浅色"
      // 挂载前读不到真实主题，先不声明按下态，免得首帧给出个错的值
      aria-pressed={theme === null ? undefined : theme === "dark"}
      onClick={toggle}
    >
      {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
};

// 与主站同款的状态徽标：每 8 秒淡出换脸再淡入
const FACES = ["😊", "😆", "🤪", "😎", "🥱", "🤯", "🥳", "😤", "🫠", "😇", "🤠", "😪"];

const NavStatus = () => {
  const [index, setIndex] = useState(0);
  const [dim, setDim] = useState(false);
  const swap = useRef<number | null>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      setDim(true);
      // 等淡出走完再换字，否则会看到换脸的中间态
      swap.current = window.setTimeout(() => {
        setIndex((i) => (i + 1) % FACES.length);
        setDim(false);
      }, 420);
    }, 8000);
    return () => {
      window.clearInterval(timer);
      if (swap.current !== null) window.clearTimeout(swap.current);
    };
  }, []);

  return (
    <span className={style.navStatus}>
      <em className={dim ? `${style.navEmo} ${style.navEmoDim}` : style.navEmo}>{FACES[index]}</em>
      Keep Smile ~
    </span>
  );
};

// 站内工具导航：全是本站工具页，走 next/link 才有客户端切换和预取。
// 回主站的入口放在页脚，不占导航胶囊的位置
export const navItems = [
  { key: "compress", label: "图片压缩", href: "/" },
  { key: "matting", label: "背景移除", href: "/matting/" },
  { key: "upscale", label: "图片放大", href: "/upscale/" },
  { key: "inpaint", label: "去水印", href: "/inpaint/" },
];

type SiteHeaderProps = {
  active: string;
};

export const SiteHeader = observer(({ active }: SiteHeaderProps) => {
  // 滚动后给页头加阴影，同主站 .site-header.scrolled
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={scrolled ? `${style.header} ${style.scrolled}` : style.header}>
      <Link href="/" className={style.brand} aria-label="Az-im home"><Logo compact /></Link>
      <nav className={style.mainNav} aria-label="站内导航">
        {navItems.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className={item.key === active ? style.active : ""}
            aria-current={item.key === active ? "page" : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className={style.navSide}>
        <NavStatus />
        <ThemeToggle />
        <NavAvatar />
      </div>
    </header>
  );
});
