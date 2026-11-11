"use client";

import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

// Плавный скролл (только ДВ), появление блоков, пересчёт триггеров.

export default function Smooth() {
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const touch = window.matchMedia("(pointer: coarse)").matches;
    ScrollTrigger.config({ ignoreMobileResize: true });

    let lenis: Lenis | null = null;
    let raf: ((t: number) => void) | null = null;
    if (!reduced && !touch) {
      lenis = new Lenis({ duration: 1.15, smoothWheel: true, anchors: { offset: -72 } });
      lenis.on("scroll", ScrollTrigger.update);
      raf = (t: number) => lenis!.raf(t * 1000);
      gsap.ticker.add(raf);
      gsap.ticker.lagSmoothing(0);
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.setAttribute("data-revealed", "");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    document.querySelectorAll("[data-reveal]").forEach((el) => io.observe(el));
    document.documentElement.classList.add("motion-ready");

    const refresh = () => ScrollTrigger.refresh();
    document.fonts?.ready.then(refresh);
    window.addEventListener("load", refresh);
    return () => {
      window.removeEventListener("load", refresh);
      io.disconnect();
      if (raf) gsap.ticker.remove(raf);
      lenis?.destroy();
      document.documentElement.classList.remove("motion-ready");
    };
  }, []);
  return null;
}
