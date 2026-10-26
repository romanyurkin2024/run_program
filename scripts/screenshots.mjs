// Снимает скриншоты страниц собранного сайта: node scripts/screenshots.mjs <outDir>
import { createRequire } from "node:module";
import { spawn } from "node:child_process";

// Playwright ставится глобально (в CI и в облачном окружении), поэтому подключаем через require
const { chromium } = createRequire(import.meta.url)("playwright");

const out = process.argv[2] ?? "screenshots";
const server = spawn("npx", ["vite", "preview", "--port", "4173", "--strictPort"], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 2500));
const base = "http://localhost:4173/run_program/";
const shots = [
  ["01-overview", "?demo#/", 1280],
  ["02-listings", "?demo#/listings", 1280],
  ["03-listing", "?demo#/listing/demo%3A1003", 1280],
  ["04-mortgage", "#/mortgage", 1280],
  ["05-plan", "#/plan", 1280],
  ["06-overview-mobile", "?demo#/", 390],
  ["07-mortgage-dark", "#/mortgage", 1280, "dark"],
];
const browser = await chromium.launch();
try {
  for (const [name, path, width, scheme = "light"] of shots) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 2, colorScheme: scheme });
    await page.addInitScript(() => {
      localStorage.setItem("kt.finances.v1", JSON.stringify({ savingsNow: 30000000, monthlySavings: 2500000 }));
    });
    await page.goto(base + path, { waitUntil: "networkidle" });
    if (name === "04-mortgage") {
      const extra = page.locator(".field", { hasText: "Досрочно" }).locator("input");
      await extra.fill("200000");
      await extra.blur();
    }
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}
console.log("done");
