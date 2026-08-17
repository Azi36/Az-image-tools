import { useCallback, useEffect, useRef } from "react";
import style from "./index.module.scss";

/**
 * 站长头像彩蛋（和主站 azi36.com 同款玩法）：
 * - 轻点：就地炸一堆表情，偶尔嘴硬一句
 * - 短时间连点 5 下：炸开并自己满屏乱弹
 * - 拖拽：弹弓，松手后满屏飞、撞墙反弹，停下来再飞回窝里
 *
 * 动画是纯命令式的 DOM 操作（克隆体 + 碎片），交给 React 反而绕远路。
 * 尊重 prefers-reduced-motion：开了就只剩一个安静的头像。
 */

const BITS = ["💥", "✨", "⭐", "🎉", "😂", "🤯", "👻", "🖼️", "💫", "🍀", "📷"];
const SAYS = ["哎哟", "别戳了", "痒", "嗯？", "干嘛", "轻点", "再戳打你", "有完没完"];

const FRICTION = 0.997;
const RESTITUTION = 0.82;
const MAX_BOUNCES = 40;
const MAX_FLY_MS = 7000;

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function pick<T>(list: ReadonlyArray<T>): T {
  return list[Math.floor(Math.random() * list.length)];
}

export const NavAvatar = () => {
  const hostRef = useRef<HTMLButtonElement>(null);
  /** 飞行中的克隆体，本体留在原地占位 */
  const flyer = useRef<HTMLElement | null>(null);
  const home = useRef<DOMRect | null>(null);
  const frame = useRef<number | null>(null);
  const fragments = useRef<Set<HTMLElement>>(new Set());
  const down = useRef<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const flying = useRef(false);
  const samples = useRef<Array<{ t: number; x: number; y: number }>>([]);
  const clicks = useRef({ count: 0, last: 0 });

  /** 从一点炸出 n 个碎片 */
  const burst = useCallback((cx: number, cy: number, n: number) => {
    if (prefersReducedMotion()) return;
    for (let i = 0; i < n; i++) {
      const node = document.createElement("span");
      node.className = style.frag;
      node.textContent = pick(BITS);
      node.style.left = `${cx}px`;
      node.style.top = `${cy}px`;
      document.body.appendChild(node);
      fragments.current.add(node);

      const angle = Math.random() * Math.PI * 2;
      const distance = 55 + Math.random() * 90;
      const dx = Math.cos(angle) * distance;
      const dy = Math.sin(angle) * distance - 30;
      const spin = (Math.random() * 2 - 1) * 260;
      const animation = node.animate(
        [
          { transform: "translate(-50%,-50%) scale(.6) rotate(0deg)", opacity: 1 },
          {
            transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1.25) rotate(${spin}deg)`,
            opacity: 0,
          },
        ],
        { duration: 700 + Math.random() * 300, easing: "cubic-bezier(.16,.8,.35,1)" },
      );
      animation.onfinish = () => {
        node.remove();
        fragments.current.delete(node);
      };
    }
  }, []);

  /** 飘一句嘴硬的话 */
  const say = useCallback((cx: number, cy: number) => {
    if (prefersReducedMotion()) return;
    const node = document.createElement("span");
    node.className = `${style.frag} ${style.says}`;
    node.textContent = pick(SAYS);
    node.style.left = `${cx}px`;
    node.style.top = `${cy}px`;
    document.body.appendChild(node);
    fragments.current.add(node);
    const animation = node.animate(
      [
        { transform: "translate(-50%,-50%) scale(.7)", opacity: 1 },
        { transform: "translate(-50%,-140%) scale(1)", opacity: 0 },
      ],
      { duration: 900, easing: "cubic-bezier(.16,.8,.35,1)" },
    );
    animation.onfinish = () => {
      node.remove();
      fragments.current.delete(node);
    };
  }, []);

  /** 造个克隆体去飞，本体隐藏但仍占位，导航不会塌 */
  const liftOff = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    home.current = rect;
    const clone = host.cloneNode(true) as HTMLElement;
    clone.style.cssText =
      `position:fixed;margin:0;pointer-events:none;z-index:9999;left:${rect.left}px;` +
      `top:${rect.top}px;width:${rect.width}px;height:${rect.height}px`;
    document.body.appendChild(clone);
    flyer.current = clone;
    host.style.visibility = "hidden";
    flying.current = true;
  }, []);

  const land = useCallback(() => {
    flyer.current?.remove();
    flyer.current = null;
    if (hostRef.current) hostRef.current.style.visibility = "";
    flying.current = false;
  }, []);

  const returnHome = useCallback(
    (x: number, y: number, angle: number) => {
      const clone = flyer.current;
      const rect = home.current;
      if (!clone || !rect) {
        land();
        return;
      }
      const animation = clone.animate(
        [
          { left: `${x}px`, top: `${y}px`, transform: `rotate(${angle}deg)` },
          { left: `${rect.left}px`, top: `${rect.top}px`, transform: "rotate(360deg)" },
        ],
        { duration: 680, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "forwards" },
      );
      animation.onfinish = () => {
        clone.style.left = `${rect.left}px`;
        clone.style.top = `${rect.top}px`;
        clone.style.transform = "";
        clone.animate(
          [
            { transform: "scale(1)" },
            { transform: "scale(1.35)" },
            { transform: "scale(.85)" },
            { transform: "scale(1)" },
          ],
          { duration: 460, easing: "cubic-bezier(0.22, 1.14, 0.36, 1)" },
        );
        // 落窝收尾再放一小簇
        burst(rect.left + rect.width / 2, rect.top + rect.height / 2, 8);
        window.setTimeout(land, 280);
      };
    },
    [burst, land],
  );

  /** 松手后的自由飞行：摩擦减速、撞墙反弹、边飞边转 */
  const fling = useCallback(
    (x: number, y: number, vx: number, vy: number) => {
      const clone = flyer.current;
      const rect = home.current;
      if (!clone || !rect) return;

      const size = rect.width;
      const margin = 4;
      const start = performance.now();
      let last = start;
      let bounces = 0;
      let angle = 0;

      // 几乎没甩动就随便给个方向，免得点一下杵在原地
      if (Math.hypot(vx, vy) < 6) {
        const a = Math.random() * Math.PI * 2;
        vx = Math.cos(a) * 15;
        vy = Math.sin(a) * 15;
      }

      const step = (now: number) => {
        const dt = Math.min(2.2, (now - last) / 16.67);
        last = now;
        x += vx * dt;
        y += vy * dt;
        vx *= FRICTION;
        vy *= FRICTION;

        const maxX = window.innerWidth - size - margin;
        const maxY = window.innerHeight - size - margin;
        let hit = false;
        if (x < margin) { x = margin; vx = -vx * RESTITUTION; bounces++; hit = true; }
        else if (x > maxX) { x = maxX; vx = -vx * RESTITUTION; bounces++; hit = true; }
        if (y < margin) { y = margin; vy = -vy * RESTITUTION; bounces++; hit = true; }
        else if (y > maxY) { y = maxY; vy = -vy * RESTITUTION; bounces++; hit = true; }

        const squash = hit ? 0.78 : 1;
        if (hit) burst(x + size / 2, y + size / 2, 6);

        angle += vx * 0.7;
        clone.style.left = `${x}px`;
        clone.style.top = `${y}px`;
        clone.style.transform = `rotate(${angle}deg) scale(${squash})`;

        const alive =
          Math.hypot(vx, vy) > 0.3 &&
          now - start < MAX_FLY_MS &&
          bounces < MAX_BOUNCES;
        if (alive) {
          frame.current = requestAnimationFrame(step);
        } else {
          frame.current = null;
          returnHome(x, y, angle);
        }
      };

      frame.current = requestAnimationFrame(step);
    },
    [burst, returnHome],
  );

  /** 轻点：小彩蛋；900ms 内连点 5 下就炸开并自己飞出去 */
  const clickEgg = useCallback(() => {
    const host = hostRef.current;
    if (!host || flying.current) return;
    const rect = host.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const now = performance.now();
    clicks.current.count = now - clicks.current.last < 900 ? clicks.current.count + 1 : 1;
    clicks.current.last = now;

    host.classList.remove(style.boom);
    void host.offsetWidth;
    host.classList.add(style.boom);

    if (clicks.current.count >= 5) {
      clicks.current.count = 0;
      burst(cx, cy, 26);
      say(cx, cy);
      if (!prefersReducedMotion()) {
        liftOff();
        const a = Math.random() * Math.PI * 2;
        const start = home.current;
        if (start) fling(start.left, start.top, Math.cos(a) * 26, Math.sin(a) * 26);
      }
      return;
    }

    burst(cx, cy, 8 + Math.floor(Math.random() * 8));
    if (Math.random() < 0.4) say(cx, cy);
  }, [burst, fling, liftOff, say]);

  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (flying.current) return;
    event.preventDefault();
    down.current = { x: event.clientX, y: event.clientY };
    dragging.current = false;
    samples.current = [{ t: performance.now(), x: event.clientX, y: event.clientY }];
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const origin = down.current;
    if (!origin) return;
    const moved = Math.hypot(event.clientX - origin.x, event.clientY - origin.y);
    if (!dragging.current && moved > 6 && !prefersReducedMotion()) {
      liftOff();
      dragging.current = true;
    }
    const clone = flyer.current;
    const rect = home.current;
    if (dragging.current && clone && rect) {
      clone.style.left = `${event.clientX - rect.width / 2}px`;
      clone.style.top = `${event.clientY - rect.height / 2}px`;
      samples.current.push({ t: performance.now(), x: event.clientX, y: event.clientY });
      if (samples.current.length > 5) samples.current.shift();
    }
  };

  const onPointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!down.current) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    const wasDrag = dragging.current;
    down.current = null;
    dragging.current = false;

    if (!wasDrag) {
      clickEgg();
      return;
    }

    // 取最近几个采样点算甩出速度
    let vx = 0;
    let vy = 0;
    if (samples.current.length >= 2) {
      const first = samples.current[0];
      const last = samples.current[samples.current.length - 1];
      const dt = Math.max(16, last.t - first.t);
      vx = ((last.x - first.x) / dt) * 16;
      vy = ((last.y - first.y) / dt) * 16;
    }
    const clone = flyer.current;
    if (clone) fling(parseFloat(clone.style.left), parseFloat(clone.style.top), vx, vy);
  };

  // 卸载时把还在天上飞的和满屏碎片都收掉
  useEffect(() => {
    const pending = fragments.current;
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      flyer.current?.remove();
      pending.forEach((node) => node.remove());
      pending.clear();
    };
  }, []);

  return (
    <button
      ref={hostRef}
      type="button"
      className={style.avatar}
      aria-label="站长头像，戳戳看"
      title="戳戳看，也可以拖着甩出去"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <img src="/avatar.png" alt="" draggable={false} />
    </button>
  );
};
