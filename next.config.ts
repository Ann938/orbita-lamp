import type { NextConfig } from "next";

// Для GitHub Pages сайт собирается статикой и живёт в подпапке
// (ann938.github.io/pikabu-neuro/). Подпапку задаёт NEXT_PUBLIC_BASE_PATH
// при `npm run deploy`; в разработке она пустая.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const pages = process.env.PAGES_EXPORT === "1";

const nextConfig: NextConfig = {
  // статическая сборка в out/ — только для публикации
  ...(pages ? { output: "export" as const, trailingSlash: true } : { cacheComponents: true, partialPrefetching: true }),
  basePath,
  images: { unoptimized: true },
  // модули подключают ядро стилей как @use "styles/core"
  sassOptions: { loadPaths: ["src"] },
  devIndicators: false,
};

export default nextConfig;
