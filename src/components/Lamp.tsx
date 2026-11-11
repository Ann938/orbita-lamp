"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import type { Color } from "three";
import type { Finish, LampScene } from "@/three/LampScene";
import s from "./Lamp.module.scss";

// Фиксированный холст со светильником на всю страницу.
// Секции отмечают точки сценария атрибутами:
//   data-stop data-pose="hero" data-tone="#ff9a3c"
// Между соседними точками поза и цвет света плавно смешиваются по прокрутке,
// поворот растёт вместе с прокруткой всей страницы.

type Pose = { x: number; y: number; s: number; dim?: number; room?: number };

const DESKTOP: Record<string, Pose> = {
  hero: { x: 0, y: 0.2, s: 0.66, room: 1 },
  statement: { x: 0.44, y: 0.02, s: 0.9, dim: 0.1 },
  modes: { x: 0, y: 0.1, s: 0.8 },
  details: { x: 0.04, y: -0.04, s: 1 },
  control: { x: -0.42, y: 0.02, s: 0.92 },
  finish: { x: -0.4, y: 0.04, s: 0.92 },
  specs: { x: 0.64, y: 0.02, s: 0.72, dim: 0.3 },
  order: { x: -0.46, y: 0.02, s: 0.86 },
  faq: { x: 0.74, y: 0.02, s: 0.56, dim: 0.5 },
};
// На телефоне светильник по центру в верхней части экрана; в длинных текстовых блоках
// он уходит вверх за кадр, чтобы не светить сквозь текст (цвет фона остаётся)
const MOBILE: Record<string, Pose> = {
  hero: { x: 0, y: 0.12, s: 0.8, room: 1 },
  statement: { x: 0, y: 0.42, s: 0.74, dim: 0.15 },
  modes: { x: 0, y: 0.3, s: 0.84 },
  details: { x: 0, y: 0.36, s: 0.82 },
  control: { x: 0, y: 1.6, s: 0.5, dim: 0.3 },
  finish: { x: 0, y: 0.48, s: 0.72 },
  specs: { x: 0, y: 1.6, s: 0.5, dim: 0.3 },
  order: { x: 0, y: 1.6, s: 0.5, dim: 0.3 },
  faq: { x: 0, y: 1.6, s: 0.5, dim: 0.3 },
};

type Stop = { at: number; pose: Pose; tone: string };

const ease = (t: number) => t * t * (3 - 2 * t);

export default function Lamp() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let scene: LampScene | null = null;
    let dead = false;
    const cleanups: (() => void)[] = [];
    const mobile = window.matchMedia("(max-width: 1023px)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const root = document.documentElement;

    let lastHex = "";
    const onTone = (c: Color) => {
      const hex = c.getHexString();
      if (hex === lastHex) return;
      lastHex = hex;
      root.style.setProperty("--tone", `#${hex}`);
      root.style.setProperty("--tone-glow", `rgba(${(c.r * 255) | 0}, ${(c.g * 255) | 0}, ${(c.b * 255) | 0}, 0.35)`);
    };

    import("@/three/LampScene").then(({ LampScene }) => {
      if (dead) return;
      try {
        scene = new LampScene(canvas.current!, { mobile, onTone: (c) => onTone(c.clone().convertLinearToSRGB()) });
      } catch {
        root.dataset.nogl = "";
        return;
      }
      const st = scene.state;
      const poses = mobile ? MOBILE : DESKTOP;

      // ---- точки сценария ----
      let stops: Stop[] = [];
      const measure = () => {
        const vh = window.innerHeight;
        stops = [...document.querySelectorAll<HTMLElement>("[data-stop]")]
          .map((el) => {
            const r = el.getBoundingClientRect();
            const top = r.top + window.scrollY;
            // первая точка — сразу с верха страницы
            const at = top < 10 ? 0 : top + r.height / 2 - vh / 2;
            let pose = poses[el.dataset.pose || "hero"] ?? poses.hero;
            // если в блоке есть место под светильник (МВ) — ставим ядро в его верхнюю часть,
            // так композиция одинакова на любой высоте экрана
            // место может лежать и в липкой сцене (режимы): тогда считаем от её верха — она прилипает к 0
            const slot = el.querySelector<HTMLElement>("[data-lamp-slot]") ?? (el.dataset.slot ? document.querySelector<HTMLElement>(el.dataset.slot) : null);
            if (slot && slot.offsetHeight > 0) {
              const sr = slot.getBoundingClientRect();
              const sticky = slot.closest<HTMLElement>("[data-sticky]");
              const top = sticky ? sr.top - sticky.getBoundingClientRect().top : sr.top + window.scrollY - at;
              const cy = top + sr.height * 0.36;
              pose = { ...pose, y: 1 - (2 * cy) / vh };
              // спальня: светильник стоит на тумбочке, верх тумбочки — у низа места под него
              if (pose.room) scene?.setRoomTop((top + sr.height * 0.97) / vh);
            }
            return { at, pose, tone: el.dataset.tone || "#ffa04d" };
          })
          .sort((a, b) => a.at - b.at);
      };
      measure();

      const apply = () => {
        if (!stops.length) return;
        const y = window.scrollY;
        let i = 0;
        while (i < stops.length - 1 && stops[i + 1].at <= y) i++;
        const a = stops[i];
        const b = stops[Math.min(i + 1, stops.length - 1)];
        const t = b === a ? 0 : ease(Math.min(1, Math.max(0, (y - a.at) / (b.at - a.at))));
        st.x = a.pose.x + (b.pose.x - a.pose.x) * t;
        st.y = a.pose.y + (b.pose.y - a.pose.y) * t;
        st.s = a.pose.s + (b.pose.s - a.pose.s) * t;
        st.dim = (a.pose.dim ?? 0) + ((b.pose.dim ?? 0) - (a.pose.dim ?? 0)) * t;
        // спальня растворяется в космосе быстрее, чем светильник доезжает до следующей позы
        const tr = Math.min(1, t * 2.2);
        st.room = (a.pose.room ?? 0) + ((b.pose.room ?? 0) - (a.pose.room ?? 0)) * tr;
        // спальня — часть первого экрана: уезжает вверх вместе с ним
        st.roomShift = y / window.innerHeight;
        st.tone.set(a.tone).lerp(tmp.set(b.tone), t);
        const max = document.documentElement.scrollHeight - window.innerHeight;
        st.spin = reduced ? 0 : (y / Math.max(max, 1)) * Math.PI * 4;
      };
      const tmp = st.tone.clone();
      apply();
      // цвет на старте берём сразу, без перелива из оранжевого
      onTone(st.tone.clone().convertLinearToSRGB());

      const onScroll = () => apply();
      const onResize = () => {
        scene?.resize();
        measure();
        apply();
      };
      const onMove = (e: PointerEvent) => {
        st.px = (e.clientX / window.innerWidth) * 2 - 1;
        st.py = (e.clientY / window.innerHeight) * 2 - 1;
        st.mx = st.px;
        st.my = -st.py;
      };
      const onOut = (e: PointerEvent) => {
        if (!e.relatedTarget) st.mx = st.my = 9; // курсор ушёл с окна — звёзды успокаиваются
      };
      const onFinish = (e: Event) => scene?.setFinish((e as CustomEvent<Finish>).detail);

      // ---- выключатель ----
      // Гаснет с коротким мерцанием, загорается — как настоящая лампа. Состояние
      // рассылается событием `orbita-power`. Включают кнопкой на основании или касанием ядра.
      let isOn = true;
      let audio: AudioContext | null = null;
      const click = (on: boolean) => {
        try {
          audio ??= new AudioContext();
          const len = Math.floor(audio.sampleRate * 0.03);
          const buf = audio.createBuffer(1, len, audio.sampleRate);
          const d = buf.getChannelData(0);
          for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 6);
          const src = audio.createBufferSource();
          src.buffer = buf;
          const f = audio.createBiquadFilter();
          f.type = "bandpass";
          f.frequency.value = on ? 2600 : 1900;
          const g = audio.createGain();
          g.gain.value = 0.35;
          src.connect(f).connect(g).connect(audio.destination);
          src.start();
        } catch {
          /* звук не обязателен */
        }
      };
      let flick: gsap.core.Timeline | null = null;
      const setOn = (on: boolean) => {
        if (on === isOn) return;
        isOn = on;
        click(on);
        flick?.kill();
        if (reduced) st.on = on ? 1 : 0;
        else if (on) {
          flick = gsap.timeline();
          [0.6, 0.1, 0.85, 0.35, 1].forEach((v, k) => flick!.set(st, { on: v }, k * 0.07));
        } else {
          flick = gsap.timeline();
          [0.45, 0.8, 0].forEach((v, k) => flick!.set(st, { on: v }, k * 0.06));
        }
        if (on) delete root.dataset.off;
        else root.dataset.off = "";
        window.dispatchEvent(new CustomEvent("orbita-power", { detail: on }));
      };
      const toggle = () => setOn(!isOn);
      const onPowerReq = (e: Event) => setOn((e as CustomEvent<boolean>).detail);
      window.addEventListener("orbita-power-set", onPowerReq);
      cleanups.push(() => {
        window.removeEventListener("orbita-power-set", onPowerReq);
        flick?.kill();
        audio?.close();
        delete root.dataset.off;
      });

      // ---- покрутить руками ----
      // Холст лежит под текстом, поэтому слушаем окно и проверяем попадание в светильник.
      // Кнопки, ссылки и поля формы не перехватываем.
      const sc = scene;
      const onLamp = (x: number, y: number, t: EventTarget | null) => {
        if ((t as Element | null)?.closest?.("a, button, input, label, textarea, [data-reveal] p, h1, h2")) return false;
        const b = sc.bounds;
        const dx = (x - b.x) / b.r;
        const dy = (y - b.y) / (b.r * 1.15);
        return dx * dx + dy * dy < 1;
      };
      let held = false;
      let lx = 0;
      let ly = 0;
      // мышь
      const onDown = (e: PointerEvent) => {
        if (e.pointerType !== "mouse" || e.button !== 0) return;
        const free = !(e.target as Element | null)?.closest?.("a, button, input, label, textarea");
        if (free && onButton(e.clientX, e.clientY)) {
          e.preventDefault();
          press();
          return;
        }
        if (!onLamp(e.clientX, e.clientY, e.target)) return;
        held = true;
        lx = sx = e.clientX;
        ly = sy = e.clientY;
        sc.grab();
        root.dataset.grab = "held";
        e.preventDefault();
      };
      const onDrag = (e: PointerEvent) => {
        if (e.pointerType !== "mouse") return;
        if (held) {
          sc.turn(e.clientX - lx, e.clientY - ly);
          lx = e.clientX;
          ly = e.clientY;
        } else if (onButton(e.clientX, e.clientY)) root.dataset.grab = "button";
        else if (onLamp(e.clientX, e.clientY, e.target)) root.dataset.grab = "";
        else delete root.dataset.grab;
      };
      // клик без перетаскивания по самому ядру — выключатель
      let sx = 0;
      let sy = 0;
      const onCore = (x: number, y: number) => {
        const b = sc.bounds;
        return Math.hypot(x - b.x, y - b.y) < b.r * 0.55;
      };
      // кнопка на основании: попадание с запасом под палец
      const onButton = (x: number, y: number, finger = false) => {
        const b = sc.bounds;
        return b.bVis && Math.hypot(x - b.bx, y - b.by) < Math.max(finger ? 30 : 18, b.r * 0.07);
      };
      const press = () => {
        sc.pressButton();
        toggle();
      };
      const onUp = (e?: PointerEvent) => {
        if (!held) return;
        held = false;
        sc.release();
        root.dataset.grab = "";
        if (e && Math.hypot(e.clientX - sx, e.clientY - sy) < 5 && onCore(e.clientX, e.clientY)) toggle();
      };
      // палец: горизонтальный свайп по светильнику крутит его, вертикальный — обычная прокрутка
      let touch: { x: number; y: number; mode: "" | "turn" | "scroll" } | null = null;
      let pinch: { d: number; z: number } | null = null;
      const dist = (e: TouchEvent) => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      const onTStart = (e: TouchEvent) => {
        const t = e.touches[0];
        st.mx = (t.clientX / window.innerWidth) * 2 - 1;
        st.my = 1 - (t.clientY / window.innerHeight) * 2;
        // два пальца на светильнике — приближение
        if (e.touches.length === 2) {
          const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
          const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
          if (onLamp(cx, cy, e.target)) {
            pinch = { d: dist(e), z: st.zoom };
            touch = null;
          }
          return;
        }
        if (e.touches.length !== 1 || !(onLamp(t.clientX, t.clientY, e.target) || onButton(t.clientX, t.clientY, true))) return;
        touch = { x: t.clientX, y: t.clientY, mode: "" };
        lx = t.clientX;
        ly = t.clientY;
      };
      const onTMove = (e: TouchEvent) => {
        const t = e.touches[0];
        st.mx = (t.clientX / window.innerWidth) * 2 - 1;
        st.my = 1 - (t.clientY / window.innerHeight) * 2;
        if (pinch && e.touches.length === 2) {
          e.preventDefault();
          setZoom(pinch.z * (dist(e) / pinch.d));
          return;
        }
        if (!touch) return;
        if (!touch.mode) {
          const ax = Math.abs(t.clientX - touch.x);
          const ay = Math.abs(t.clientY - touch.y);
          if (ax + ay < 8) return;
          touch.mode = ax > ay ? "turn" : "scroll";
          if (touch.mode === "turn") sc.grab();
        }
        if (touch.mode === "turn") {
          e.preventDefault();
          sc.turn(t.clientX - lx, 0);
          lx = t.clientX;
        }
      };
      const onTEnd = (e: TouchEvent) => {
        if (e.touches.length < 2) pinch = null;
        if (touch?.mode === "turn") sc.release();
        // короткое касание кнопки или ядра — включить/выключить
        else if (touch && !touch.mode && e.type === "touchend" && (onButton(touch.x, touch.y, true) || onCore(touch.x, touch.y))) {
          e.preventDefault(); // без «призрачного» клика после касания
          if (onButton(touch.x, touch.y, true)) press();
          else toggle();
        }
        touch = null;
        st.mx = st.my = 9;
      };
      const setZoom = (z: number) => {
        st.zoom = Math.min(2.6, Math.max(1, z));
        window.dispatchEvent(new CustomEvent("orbita-zoom", { detail: st.zoom }));
      };
      const onZoomReq = (e: Event) => setZoom(st.zoom + (e as CustomEvent<number>).detail);
      const onWheel = (e: WheelEvent) => {
        if (!(e.ctrlKey || e.metaKey) || !onLamp(e.clientX, e.clientY, null)) return;
        e.preventDefault(); // не масштабировать страницу браузером
        setZoom(st.zoom * Math.exp(-e.deltaY * 0.004));
      };
      window.addEventListener("orbita-zoom-set", onZoomReq);
      window.addEventListener("wheel", onWheel, { passive: false });
      cleanups.push(() => {
        window.removeEventListener("orbita-zoom-set", onZoomReq);
        window.removeEventListener("wheel", onWheel);
      });
      window.addEventListener("pointerdown", onDown);
      window.addEventListener("pointermove", onDrag, { passive: true });
      window.addEventListener("pointerup", onUp);
      const onBlur = () => onUp();
      window.addEventListener("blur", onBlur);
      window.addEventListener("touchstart", onTStart, { passive: true });
      window.addEventListener("touchmove", onTMove, { passive: false });
      window.addEventListener("touchend", onTEnd);
      window.addEventListener("touchcancel", onTEnd);
      cleanups.push(() => {
        window.removeEventListener("pointerdown", onDown);
        window.removeEventListener("pointermove", onDrag);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("blur", onBlur);
        window.removeEventListener("touchstart", onTStart);
        window.removeEventListener("touchmove", onTMove);
        window.removeEventListener("touchend", onTEnd);
        window.removeEventListener("touchcancel", onTEnd);
        delete root.dataset.grab;
      });
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onResize);
      window.addEventListener("orbita-finish", onFinish);
      if (window.matchMedia("(pointer: fine)").matches) {
        window.addEventListener("pointermove", onMove, { passive: true });
        document.addEventListener("pointerout", onOut);
      }
      // высота страницы меняется после загрузки шрифтов и раскрытия FAQ
      const ro = new ResizeObserver(() => {
        measure();
        apply();
      });
      ro.observe(document.body);
      cleanups.push(() => {
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onResize);
        window.removeEventListener("orbita-finish", onFinish);
        window.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerout", onOut);
        ro.disconnect();
      });

      // ---- интро: светильник «включается» с лёгким мерцанием ----
      root.dataset.lit = "";
      if (reduced) {
        st.power = 1;
      } else {
        const tl = gsap.timeline({ delay: 0.35 });
        [0.55, 0.08, 0.8, 0.25, 1].forEach((v, k) => tl.set(st, { power: v }, k * 0.09 + (k > 2 ? 0.12 : 0)));
        cleanups.push(() => tl.kill());
      }
    });

    return () => {
      dead = true;
      cleanups.forEach((f) => f());
      scene?.dispose();
    };
  }, []);

  return <canvas ref={canvas} className={s.canvas} aria-hidden="true" />;
}
