import Link from "next/link";
import { observer } from "mobx-react-lite";
import style from "./index.module.scss";
import { Logo } from "@/components/Logo";
import { navItems } from "@/components/SiteHeader";

export const SiteFooter = observer(() => {
  return (
    <footer className={style.footer}>
      <div className={style.footerGrid}>
        <div className={style.footerBrand}>
          <Link href="/" className={style.brand} aria-label="Az-im home"><Logo /></Link>
          <p className={style.footerTag}>把图片变轻一点。</p>
        </div>
        <div className={style.footerCols}>
          {navItems.map((item) => (
            <Link key={item.key} href={item.href}>{item.label}</Link>
          ))}
          <a href="https://azi36.com">主站</a>
          <a href="https://github.com/Azi36/Az-image-tools" target="_blank" rel="noreferrer">GitHub</a>
        </div>
      </div>
      <div className={style.footerMeta}>
        <span>
          © 2026 <a href="https://azi36.com">Azi36</a> · No Rights Reserved.
        </span>
        <a href="#top">回到顶部 ↑</a>
      </div>
      <div className={style.footerGhost} aria-hidden="true">AZ-IM</div>
    </footer>
  );
});
