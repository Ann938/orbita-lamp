// Публикация сайта на GitHub Pages: статическая сборка в out/ и выкладка
// в ветку gh-pages репозитория origin.
// Запуск: npm run deploy          — собрать и опубликовать
//         npm run deploy -- --build-only — только собрать out/ (проверить локально)
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = "orbita-lamp"; // имя репозитория = подпапка сайта
const env = {
  ...process.env,
  PAGES_EXPORT: "1",
  NEXT_PUBLIC_BASE_PATH: `/${REPO}`,
  NEXT_PUBLIC_SITE_ORIGIN: "https://ann938.github.io",
};

// 1. Сборка
rmSync("out", { recursive: true, force: true });
// next запускаем напрямую через node — без shell, одинаково на Windows и macOS
const build = spawnSync(process.execPath, ["node_modules/next/dist/bin/next", "build"], { env, stdio: "inherit" });
if (build.status !== 0) process.exit(build.status ?? 1);
if (!existsSync("out/index.html")) throw new Error("Сборка не создала out/index.html");
writeFileSync("out/.nojekyll", ""); // иначе GitHub Pages спрячет папку _next

// Next при статической сборке кладёт данные предзагрузки страниц в
// `__next.checkout/__PAGE__.txt`, а браузер запрашивает их как
// `__next.checkout.__PAGE__.txt` — без копии под этим именем в консоли 404.
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (!e.isDirectory()) continue;
    if (e.name.startsWith("__next.")) {
      for (const f of readdirSync(p, { withFileTypes: true })) {
        if (f.isFile()) cpSync(join(p, f.name), `${p}.${f.name}`);
      }
    } else walk(p);
  }
};
walk("out");
if (process.argv.includes("--build-only")) {
  console.log("собрано в out/ (без публикации)");
  process.exit(0);
}

// 2. Выкладка в gh-pages
const git = (args, cwd) => execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "inherit"] }).toString().trim();
const remote = git(["remote", "get-url", "origin"]);
const name = git(["config", "user.name"]);
const email = git(["config", "user.email"]);
const dir = mkdtempSync(join(tmpdir(), "orbita-pages-"));
try {
  cpSync("out", dir, { recursive: true });
  git(["init", "-q", "-b", "gh-pages"], dir);
  git(["config", "user.name", name], dir);
  git(["config", "user.email", email], dir);
  git(["add", "-A"], dir);
  git(["commit", "-q", "-m", `Публикация сайта ${new Date().toISOString().slice(0, 16).replace("T", " ")}`], dir);
  git(["push", "-q", "--force", remote, "gh-pages"], dir);
  console.log(`опубликовано: https://ann938.github.io/${REPO}/`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
