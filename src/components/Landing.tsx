"use client";

import { useEffect, useRef, useState } from "react";
import { details, faq, finish, footer, hero, modes, nav, order, price, specs, statement } from "@/content";
import s from "./landing.module.scss";

// Лендинг «Орбита». Светильник живёт на фиксированном холсте (Lamp.tsx),
// секции только задают ему позу и цвет через data-stop / data-pose / data-tone.

const d = (n: number) => ({ "--d": n }) as React.CSSProperties;

function Logo() {
  return (
    <a href="#top" className={s.logo} aria-label="Орбита — наверх">
      {/* знак: светящаяся планета, орбита проходит позади и перед ней */}
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <defs>
          <radialGradient id="orbita-logo-core" cx="38%" cy="34%" r="70%">
            <stop offset="0" stopColor="#fff" />
            <stop offset="0.35" stopColor="currentColor" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0.35" />
          </radialGradient>
        </defs>
        <g transform="rotate(-22 20 20)">
          {/* дальняя половина орбиты — за планетой, тусклее */}
          <path d="M2.5 20a17.5 6 0 0 1 35 0" fill="none" stroke="currentColor" strokeWidth="1.3" strokeOpacity="0.45" />
          <circle cx="20" cy="20" r="8.5" fill="url(#orbita-logo-core)" />
          {/* ближняя половина — поверх планеты */}
          <path d="M37.5 20a17.5 6 0 0 1-35 0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </g>
      </svg>
      Орбита
    </a>
  );
}

function Arrow() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={s.arrow}>
      <path d="M4 10h12M11 5l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Приближение светильника: «−» / «+», значение синхронно с щипком и Ctrl/⌘ + колесом
function ZoomControls() {
  const [z, setZ] = useState(1);
  useEffect(() => {
    const sync = (e: Event) => setZ((e as CustomEvent<number>).detail);
    window.addEventListener("orbita-zoom", sync);
    return () => window.removeEventListener("orbita-zoom", sync);
  }, []);
  const step = (d: number) => window.dispatchEvent(new CustomEvent("orbita-zoom-set", { detail: d }));
  return (
    <div className={s.zoom} role="group" aria-label="Приближение светильника">
      <button type="button" onClick={() => step(-0.4)} disabled={z <= 1.01} aria-label="Отдалить">
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M5 10h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      <span>{Math.round(z * 100)}%</span>
      <button type="button" onClick={() => step(0.4)} disabled={z >= 2.59} aria-label="Приблизить">
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M5 10h10M10 5v10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

// Кнопка питания в шапке — значок без подписи. Состояние общее со сценой:
// кнопка на основании и касание ядра тоже переключают её (событие `orbita-power`).
function PowerButton() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const sync = (e: Event) => setOn((e as CustomEvent<boolean>).detail);
    window.addEventListener("orbita-power", sync);
    return () => window.removeEventListener("orbita-power", sync);
  }, []);
  return (
    <button
      type="button"
      className={s.power}
      aria-pressed={on}
      aria-label={on ? "Выключить светильник" : "Включить светильник"}
      title={on ? "Выключить свет" : "Включить свет"}
      onClick={() => window.dispatchEvent(new CustomEvent("orbita-power-set", { detail: !on }))}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3.5v8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M7.05 6.6a7 7 0 1 0 9.9 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </button>
  );
}

function Header() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 40);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header className={s.header} data-scrolled={scrolled || undefined}>
      <div className={s.headerInner}>
        <Logo />
        <nav className={s.nav}>
          {nav.map((n) => (
            <a key={n.href} href={n.href}>
              {n.label}
            </a>
          ))}
        </nav>
        <PowerButton />
        <a href="#order" className={s.headerCta}>
          Предзаказ <span>{price.now}</span>
        </a>
      </div>
    </header>
  );
}

// Слова абзаца загораются по мере прокрутки
function GlowText({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const el = ref.current!;
    const words = [...el.querySelectorAll<HTMLElement>("span")];
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const vh = window.innerHeight;
        const p = Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (r.height + vh * 0.35)));
        const lit = p * words.length;
        words.forEach((w, i) => w.style.setProperty("--lit", String(Math.min(1, Math.max(0.16, lit - i + 0.4)))));
      });
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => {
      window.removeEventListener("scroll", on);
      cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <p ref={ref} className={s.glowText}>
      {text.split(" ").map((w, i) => (
        <span key={i}>{w} </span>
      ))}
    </p>
  );
}

function Modes() {
  const [active, setActive] = useState(0);
  const steps = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && setActive(Number((e.target as HTMLElement).dataset.i))),
      { rootMargin: "-50% 0px -50% 0px" },
    );
    steps.current!.querySelectorAll("[data-i]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  // клик по режиму на шкале — прокрутка к его шагу (цвет поменяет сцена)
  const go = (i: number) => {
    const el = steps.current!.querySelector<HTMLElement>(`[data-i="${i}"]`)!;
    const r = el.getBoundingClientRect();
    window.scrollTo({ top: r.top + window.scrollY + r.height / 2 - window.innerHeight / 2, behavior: "smooth" });
  };
  const m = modes.items;
  const tones = m.map((it) => it.tone).join(", ");
  const rail = { "--rail": `linear-gradient(180deg, ${tones})`, "--rail-h": `linear-gradient(90deg, ${tones})` };
  return (
    <section className={s.modes} id="modes">
      <div className={s.modesTrack} style={{ "--n": m.length } as React.CSSProperties}>
        <div className={s.modesSticky} data-sticky>
          <h2 className={s.h2}>{modes.title}</h2>
          <div className={s.slot} id="modes-slot" data-lamp-slot aria-hidden="true" />
          <div className={s.modesRow} aria-live="polite">
            <div className={s.modesNames}>
              {m.map((it, i) => (
                <div key={it.name} className={s.modeName} data-on={i === active || undefined} data-past={i < active || undefined}>
                  <b>{it.name}</b>
                </div>
              ))}
            </div>
            <div className={s.modeTexts}>
              {m.map((it, i) => (
                <p key={it.name} className={s.modeText} data-on={i === active || undefined}>
                  {it.text}
                </p>
              ))}
            </div>
          </div>
          {/* шкала режимов: градиент всех цветов, светящийся бегунок едет к активному */}
          <ol className={s.dial} style={{ ...rail, "--k": active, "--n": m.length } as React.CSSProperties}>
            <span className={s.dialRail} aria-hidden="true">
              <i />
            </span>
            {m.map((it, i) => (
              <li key={it.name} data-on={i === active || undefined} style={{ "--c": it.tone } as React.CSSProperties}>
                <button type="button" onClick={() => go(i)} aria-current={i === active || undefined}>
                  {it.name}
                </button>
              </li>
            ))}
          </ol>
        </div>
        <div className={s.modesSteps} ref={steps}>
          {m.map((it, i) => (
            <div key={it.name} data-i={i} data-stop data-pose="modes" data-tone={it.tone} data-slot="#modes-slot" />
          ))}
        </div>
      </div>
    </section>
  );
}

function Finish() {
  const [cur, setCur] = useState(finish.items[0].id);
  // наведение показывает металл на модели, клик — выбирает
  const show = (id: string) => window.dispatchEvent(new CustomEvent("orbita-finish", { detail: id }));
  const pick = (id: string) => {
    setCur(id);
    show(id);
  };
  return (
    <section className={s.finish} data-stop data-pose="finish" data-tone="#ffb35c">
      <div className={s.finishCol}>
        <div className={s.slot} data-lamp-slot aria-hidden="true" />
        <h2 className={s.h2} data-reveal>
          {finish.title}
        </h2>
        <p className={s.finishLead} data-reveal style={d(1)}>
          {finish.lead}
        </p>
        <div className={s.swatches} role="radiogroup" aria-label={finish.title} onPointerLeave={() => show(cur)}>
          {finish.items.map((f, i) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={cur === f.id}
              className={s.swatch}
              onClick={() => pick(f.id)}
              onPointerEnter={(e) => e.pointerType === "mouse" && show(f.id)}
              style={{ "--c": f.color, ...d(i + 2) } as React.CSSProperties}
              data-reveal
            >
              <i className={s.metal} aria-hidden="true" />
              <span className={s.swatchText}>
                <b>{f.name}</b>
                <small>{f.note}</small>
              </span>
              <em className={s.check} aria-hidden="true" />
            </button>
          ))}
        </div>
        <a href="#order" className={`${s.btn} ${s.finishCta}`}>
          {finish.cta}
          <Arrow />
        </a>
      </div>
    </section>
  );
}

function Order() {
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const digits = String(f.get("phone") || "").replace(/\D/g, "");
    if (!String(f.get("name") || "").trim()) return setErr("name");
    if (digits.length < 10) return setErr("phone");
    setErr("");
    setSent(true);
  };
  return (
    <section className={s.order} id="order" data-stop data-pose="order" data-tone="#ff7a4a">
      <div className={s.orderCard} data-reveal>
        <h2 className={s.orderTitle}>{order.title}</h2>
        <p className={s.body}>{order.lead}</p>
        <div className={s.price}>
          <b>{price.now}</b>
          <s>{price.old}</s>
          <span>{price.ship}</span>
        </div>
        <ul className={s.perks}>
          {order.perks.map((p) => (
            <li key={p}>
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {p}
            </li>
          ))}
        </ul>
        {sent ? (
          <div className={s.done} role="status">
            <b>{order.done.title}</b>
            <p>{order.done.text}</p>
          </div>
        ) : (
          <form className={s.form} onSubmit={onSubmit} noValidate>
            <label className={s.field} data-err={err === "name" || undefined}>
              <input name="name" placeholder=" " autoComplete="name" onInput={() => err === "name" && setErr("")} />
              <span>{order.form.name}</span>
            </label>
            <label className={s.field} data-err={err === "phone" || undefined}>
              <input name="phone" type="tel" inputMode="tel" placeholder=" " autoComplete="tel" onInput={() => err === "phone" && setErr("")} />
              <span>{order.form.phone}</span>
            </label>
            <button type="submit" className={s.btn}>
              {order.form.cta}
              <Arrow />
            </button>
            <p className={s.formNote}>{err ? (err === "name" ? "Напишите, как к вам обращаться" : "Проверьте номер — нужно 10 цифр") : order.form.note}</p>
          </form>
        )}
      </div>
    </section>
  );
}

function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <section className={s.faq} id="faq" data-stop data-pose="faq" data-tone="#ff9a3c">
      <div className={s.faqHead}>
        <h2 className={s.h2} data-reveal style={d(1)}>
          {faq.title}
        </h2>
      </div>
      <ul className={s.faqList}>
        {faq.items.map((it, i) => (
          <li key={it.q} data-open={open === i || undefined} data-reveal style={d(i)}>
            <button type="button" aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)}>
              {it.q}
              <i aria-hidden="true" />
            </button>
            <div className={s.faqA}>
              <p>{it.a}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function Landing() {
  return (
    <div className={s.page}>
      <Header />
      <ZoomControls />
      <main>
        {/* 01 · Первый экран */}
        <section className={s.hero} id="top" data-stop data-pose="hero" data-tone="#ff9a3c">
          <h1 className={s.h1}>{hero.title}</h1>
          <div className={s.slot} data-lamp-slot aria-hidden="true" />
          <div className={s.heroBottom}>
            <p className={s.heroLead}>{hero.lead}</p>
            <a href="#order" className={s.btn}>
              {hero.cta}
              <Arrow />
            </a>
          </div>
        </section>

        {/* 02 · Идея */}
        <section className={s.statement} data-stop data-pose="statement" data-tone="#ffb86b">
          <div className={s.slot} data-lamp-slot aria-hidden="true" />
          <h2 className={s.h2} data-reveal>
            {statement.title}
          </h2>
          <GlowText text={statement.text} />
          <ul className={s.facts}>
            {statement.facts.map((f, i) => (
              <li key={f.k} data-reveal style={d(i)}>
                <b>{f.k}</b>
                <span>{f.v}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* 03 · Режимы: каждый шаг перекрашивает свет */}
        <Modes />

        {/* 04 · Детали вокруг светильника */}
        <section className={s.details} id="details" data-stop data-pose="details" data-tone="#ff8f5a">
          <div className={s.detailsHead}>
            <h2 className={s.h2} data-reveal style={d(1)}>
              {details.title}
            </h2>
            <p className={s.lead} data-reveal style={d(2)}>
              {details.lead}
            </p>
          </div>
          <div className={s.slot} data-lamp-slot aria-hidden="true" />
          <ul className={s.callouts}>
            {details.items.map((it, i) => (
              <li key={it.n} className={s.callout} data-k={i} data-reveal style={d(i)}>
                <span className={s.calloutN}>{it.n}</span>
                <b>{it.name}</b>
                <p>{it.text}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* 06 · Отделка: меняет металл модели */}
        <Finish />

        {/* 07 · Характеристики */}
        <section className={s.specs} id="specs" data-stop data-pose="specs" data-tone="#34dcc0">
          <div className={s.specsHead}>
            <h2 className={s.h2} data-reveal style={d(1)}>
              {specs.title}
            </h2>
          </div>
          <dl className={s.specGrid}>
            {specs.items.map((it, i) => (
              <div key={it.v} data-reveal style={d(i % 4)}>
                <dt>
                  {it.k}
                  {it.u && <small>{it.u}</small>}
                </dt>
                <dd>{it.v}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* 08 · Предзаказ */}
        <Order />

        {/* 09 · Вопросы */}
        <Faq />
      </main>

      <footer className={s.footer}>
        <div className={s.footRow}>
          <span>{footer.copy}</span>
          <nav>
            {footer.links.map((l) => (
              <a key={l} href="#faq">
                {l}
              </a>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}
