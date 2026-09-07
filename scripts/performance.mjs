import lighthouse from "lighthouse";
import { launch } from "chrome-launcher";
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { gzipSync } from "node:zlib";
const root = path.resolve("dist");
const server = http.createServer(async (req, res) => {
  try {
    const file = path.resolve(
      root,
      "." + decodeURIComponent(new URL(req.url, "http://localhost").pathname),
    );
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(404).end();
      return;
    }
    const data = await fs.readFile(file);
    const types = {
      ".html": "text/html",
      ".css": "text/css",
      ".js": "text/javascript",
      ".json": "application/json",
      ".woff2": "font/woff2",
      ".woff": "font/woff",
      ".webp": "image/webp",
      ".png": "image/png",
    };
    const compress =
      /\b(?:gzip)\b/.test(req.headers["accept-encoding"] || "") &&
      [".html", ".css", ".js", ".json"].includes(path.extname(file));
    const body = compress ? gzipSync(data) : data;
    res
      .writeHead(200, {
        "Content-Type": types[path.extname(file)] || "application/octet-stream",
        "Content-Length": body.length,
        Vary: "Accept-Encoding",
        ...(compress ? { "Content-Encoding": "gzip" } : {}),
      })
      .end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let chrome;
try {
  chrome = await launch({
    chromePath: chromium.executablePath(),
    chromeFlags: ["--headless", "--no-sandbox"],
  });
  await fs.mkdir("reports/performance", { recursive: true });
  const summaries = [];
  for (const page of ["index", "plan", "calendar-2026-2027"]) {
    const r = await lighthouse(`${base}/${page}.html`, {
      port: chrome.port,
      output: "json",
      logLevel: "error",
      onlyCategories: ["performance", "accessibility"],
    });
    await fs.writeFile(`reports/performance/${page}.json`, r.report);
    const c = r.lhr.categories;
    const report = {
      page,
      performance: c.performance.score * 100,
      accessibility: c.accessibility.score * 100,
      LCP: r.lhr.audits["largest-contentful-paint"].numericValue,
      CLS: r.lhr.audits["cumulative-layout-shift"].numericValue,
    };
    summaries.push(report);
    console.log(report);
    if (c.performance.score < 0.9 || c.accessibility.score < 0.95)
      process.exitCode = 1;
  }
  await fs.writeFile(
    "reports/performance/summary.json",
    JSON.stringify(summaries, null, 2),
  );
} finally {
  if (chrome) await chrome.kill();
  server.close();
}
