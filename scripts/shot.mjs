// Снимки страницы на разных позициях скролла для самопроверки.
// node scripts/shot.mjs <url> <outDir> [width] [height] [theme] [step] [maxShots]
// ДВ: Chromium, скролл колесом (как живой пользователь).
// МВ: ENGINE=webkit MOBILE=1 — Safari-движок, тач-эмуляция, скролл без колеса.
// Печатает ошибки консоли и горизонтальную прокрутку.
import { chromium, webkit } from "playwright";
import path from "node:path";
import fs from "node:fs";

const [, , url = "http://localhost:3200/", out = "shots", w = "1440", h = "900", theme = "light", step = "450", maxShots = "60"] =
  process.argv;
const mobile = process.env.MOBILE === "1";
const engine = process.env.ENGINE === "webkit" ? webkit : chromium;
const exe = engine === chromium ? process.env.PW_CHROME : undefined;

const browser = await engine.launch(exe ? { executablePath: exe } : {});
const page = await browser.newPage({
  viewport: { width: +w, height: +h },
  ...(mobile ? { isMobile: engine === chromium, hasTouch: true, deviceScaleFactor: 2 } : {}),
});
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
await page.addInitScript((t) => localStorage.setItem("temp:theme", t), theme);
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
fs.mkdirSync(out, { recursive: true });

const total = await page.evaluate(() => document.documentElement.scrollHeight);
const hscroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
console.log(`scrollHeight ${total}, horizontal overflow: ${hscroll}`);

let i = 0;
let last = -1;
while (i < +maxShots) {
  const y = await page.evaluate(() => Math.round(window.scrollY));
  await page.screenshot({ path: path.join(out, `${String(i).padStart(2, "0")}_${y}.jpg`), type: "jpeg", quality: 60 });
  if (y === last) break;
  last = y;
  if (mobile) {
    await page.evaluate((d) => window.scrollBy(0, d), +step);
  } else {
    await page.mouse.move(+w / 2, +h / 2);
    await page.mouse.wheel(0, +step);
  }
  await page.waitForTimeout(mobile ? 900 : 1300);
  i++;
}
console.log("errors:", errors.length ? errors.join("\n") : "none");
await browser.close();
