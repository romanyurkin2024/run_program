// Проверка закладки «В трекер» на имитации страницы Krisha (после npm run build):
//   node scripts/test-bookmarklet.cjs <папка для скриншотов>
const { chromium } = require("playwright");
const { spawn } = require("child_process");
const out = process.argv[2];
const ID = "1012610727";
const A = "aaaaaaaa-1111-2222-3333-444444444444", B = "bbbbbbbb-1111-2222-3333-444444444444";
const cdn = (u, n, s) => `https://krisha-photos.kcdn.online/webp/aa/${u}/${n}-${s}`;
const fake = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<h1>3-комнатная квартира · 83 м², Розыбакиева 197/2</h1>
<div class="gallery">${[11,12,13,14,15,16].map(n=>`<picture data-full-src="${cdn(A,n,"full.jpg")}"><source srcset="${cdn(A,n,"400x300.webp")} 1x, ${cdn(A,n,"750x470.webp")} 2x"><img src="${cdn(A,n,"400x300.jpg")}"></picture>`).join("")}</div>
<div class="offer__contacts-phones"><a href="tel:+77011234567">+7 701 123 45 67</a></div>
<div class="js-description">Продаю светлую квартиру в ЖК Estet.\nДизайнерский ремонт, паркинг.</div>
<div class="similar">${[1,2].map(n=>`<img src="${cdn(B,n,"400x300.jpg")}">`).join("")}</div>
</body></html>`;
const colors = ["#c8b8a4","#b4c3cf","#cdbfae","#bfcbbd","#cbbfc8","#d5c9b6"];
(async () => {
  const srv = spawn("npx", ["vite", "preview", "--port", "4175", "--strictPort"], { stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 2500));
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  await ctx.route(`https://krisha.kz/a/show/${ID}`, (r) => r.fulfill({ contentType: "text/html", body: fake }));
  await ctx.route("https://krisha-photos.kcdn.online/**", (r) => {
    const n = +(r.request().url().match(/\/(\d+)-[^/]+$/)?.[1] ?? 0);
    r.fulfill({ contentType: "image/svg+xml", body: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="800" height="600" fill="${colors[n % 6]}"/><text x="400" y="320" font-size="48" text-anchor="middle" fill="#fff" font-family="sans-serif">тест-фото ${n}</text></svg>` });
  });
  const site = await ctx.newPage();
  await site.goto("http://localhost:4175/run_program/#/bookmarklet", { waitUntil: "networkidle" });
  await site.screenshot({ path: `${out}/10-bookmarklet.png`, fullPage: true });
  const code = await site.locator("a.bookmarklet").getAttribute("href");
  console.log("bookmarklet length:", code.length, "starts:", code.slice(0, 20));

  const krisha = await ctx.newPage();
  await krisha.goto(`https://krisha.kz/a/show/${ID}`);
  const [popup] = await Promise.all([ctx.waitForEvent("page"), krisha.evaluate(decodeURIComponent(code.slice("javascript:".length)))]);
  await popup.waitForLoadState("networkidle");
  console.log("import url:", popup.url().slice(0, 80) + "…");
  console.log("import page:", (await popup.locator("h3").first().textContent()));
  await popup.screenshot({ path: `${out}/11-import.png` });
  const saved = await popup.evaluate(() => JSON.parse(localStorage.getItem("kt.extras.v1")));
  const x = saved[`krisha:${ID}`];
  console.log("saved photos:", x.photos.length, x.photos.map((u) => u.split("/").pop()).join(","), "| phones:", x.phones, "| desc:", JSON.stringify(x.description));
  await popup.locator("a.btn").click();
  await popup.waitForLoadState("networkidle"); await popup.waitForTimeout(400);
  await popup.screenshot({ path: `${out}/12-listing-with-photos.png`, fullPage: true });
  await b.close(); srv.kill();
})();
