import { defineConfig } from "astro/config";
export default defineConfig({
  output: "static",
  site: "https://nauczyciel.szkolamistrzow.info",
  build: { format: "file" },
  vite: { build: { assetsInlineLimit: 0 } },
});
