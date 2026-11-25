#!/usr/bin/env node
// Demotools: True Vision renders both charts from a typed final Rx; Frame/Lens Preview edges two
// Rx in the same frame. Light and dark, phone to desktop, no overflow, nothing saved.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json" };
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const file = path.resolve(root, "." + (pathname === "/" ? "/index.html" : pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    res.setHeader("Content-Type", types[path.extname(file)] || "application/octet-stream");
    res.end(await fs.readFile(file));
  } catch { res.writeHead(404).end(); }
});
const shots = process.env.DIOPTRA_SCREENSHOT_DIR;

async function overflow(page) {
  return page.evaluate(() => ({ scroll: document.documentElement.scrollWidth,
    over: [...document.querySelectorAll("body *")].filter(e => e.getBoundingClientRect().right > innerWidth + 1 || e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX === "visible" && e.getBoundingClientRect().width >= innerWidth - 1)
      .map(e => `${e.tagName}#${e.id}.${String(e.className.baseVal ?? e.className).split(" ")[0]}:${Math.round(e.getBoundingClientRect().right)}`).slice(0, 8) }));
}

// Gradient energy of a canvas: sharp letters have steep edges, blurred ones do not.
const sharpness = (page, id) => page.evaluate(id => {
  const c = document.getElementById(id), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let energy = 0;
  for (let y = 0; y < c.height; y++) for (let x = 1; x < c.width; x++) {
    const i = (y * c.width + x) * 4;
    energy += (d[i + 1] - d[i - 3]) ** 2;
  }
  return energy / (c.width * c.height);
}, id);

(async () => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  if (shots) await fs.mkdir(shots, { recursive: true });
  const url = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.DIOPTRA_BROWSER_CHANNEL ? { channel: process.env.DIOPTRA_BROWSER_CHANNEL } : {}) });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
    await context.addInitScript(() => localStorage.setItem("oculi-zl-first-run", "seen"));
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", err => errors.push(err.message));
    await page.goto(url);
    const storageBefore = await page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort()));

    // The tab sits between Genius and Tools and keeps arrow-key order.
    await page.locator("#geniusTab").focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.locator("#demoTab").getAttribute("aria-selected"), "true");
    assert.equal(await page.locator("#demoPanel").isVisible(), true);
    assert.equal(await page.evaluate(() => document.body.dataset.view), "demo");
    assert.equal(await page.locator("#actionBar").isVisible(), false, "no case actions on Demotools");

    // ------------------------------------------------------------ True Vision
    await page.locator("#tvShow").click();
    assert.match(await page.locator("#tvStatus").innerText(), /age/i);
    await page.locator("#tvAge").fill("9");
    await page.locator("#tvShow").click();
    assert.match(await page.locator("#tvStatus").innerText(), /final Rx for the right eye/);
    await page.locator("#tvFinOdSph").selectOption("3.00");
    await page.locator("#tvFinOdCyl").selectOption("1.50");
    await page.locator("#tvFinOdAx").selectOption("180");
    await page.locator("#tvShow").click();
    await page.locator("#tvCompare").waitFor({ state: "visible" });
    assert.match(await page.locator("#tvCurrentNote").innerText(), /No glasses · about 4\.50 D out of focus/);
    assert.match(await page.locator("#tvTrueNote").innerText(), /Final Rx −3\.00 −1\.50 × 180° · in focus/);
    { const t = await sharpness(page, "tvCanvasTrue"), c = await sharpness(page, "tvCanvasCurrent"); assert.ok(t > 2 * c, `true vision is sharper: ${t} vs ${c}`); }

    // Current glasses; the chart follows segment changes without another tap.
    await page.locator("#tvGlasses").getByRole("radio", { name: "Wears glasses" }).click();
    assert.equal(await page.locator("#tvCompare").isVisible(), false);
    await page.locator("#tvShow").click();
    assert.match(await page.locator("#tvStatus").innerText(), /current glasses for the right eye/);
    await page.locator("#tvCurOdSph").selectOption("2.00");
    await page.locator("#tvShow").click();
    await page.locator("#tvCompare").waitFor({ state: "visible" });
    assert.match(await page.locator("#tvCurrentNote").innerText(), /Current glasses −2\.00 DS · about 2\.50 D out of focus/);
    await page.locator("#tvScene").getByRole("radio", { name: "Near" }).click();
    await page.waitForFunction(() => /at 40 cm/.test(document.getElementById("tvStatus").textContent));
    if (shots) await page.locator("#demoVisionForm").screenshot({ path: path.join(shots, "demotools-true-vision.png") });

    // A presbyope: the final Rx's ADD clears the near chart.
    await page.locator("#tvAge").fill("58");
    await page.locator("#tvFinAdd").selectOption("2.00");
    await page.locator("#tvShow").click();
    await page.locator("#tvCompare").waitFor({ state: "visible" });
    assert.match(await page.locator("#tvTrueNote").innerText(), /in focus/);
    assert.match(await page.locator("#tvCurrentNote").innerText(), /out of focus/);

    // OS without an OS Rx is refused rather than guessed.
    await page.locator("#tvEye").getByRole("radio", { name: "OS" }).click();
    await page.locator("#tvShow").click();
    assert.match(await page.locator("#tvStatus").innerText(), /left eye/);
    assert.equal(await page.locator("#tvCompare").isVisible(), false);
    await page.locator("#tvReset").click();
    assert.equal(await page.locator("#tvAge").inputValue(), "");
    assert.equal(await page.locator("#tvCurrentFields").isVisible(), false);

    // ------------------------------------------------------------ Frame/Lens Preview
    await page.locator("#demoLensTab").click();
    assert.equal(await page.locator("#demoLensForm").isVisible(), true);
    assert.equal(await page.locator("#demoVisionForm").isVisible(), false);
    await page.locator("#flShow").click();
    assert.match(await page.locator("#flError").innerText(), /Rx A/);
    await page.locator("#flRxASph").selectOption("2.00");
    await page.locator("#flRxBSph").selectOption("6.00");
    await page.locator("#flRxBCyl").selectOption("1.50");
    await page.locator("#flRxBAx").selectOption("180");
    await page.locator("#flShow").click();
    await page.locator("#flCompare").waitFor({ state: "visible" });
    const figures = async id => page.locator(`#${id} .lens-figures`).evaluate(dl => {
      const out = {}; const dts = dl.querySelectorAll("dt"), dds = dl.querySelectorAll("dd");
      dts.forEach((dt, i) => { out[dt.textContent] = dds[i].textContent; }); return out;
    });
    const a = await figures("flFigA"), b = await figures("flFigB");
    assert.equal(a.Centre, "1.0 mm");
    const edge = s => Number(/[\d.]+/.exec(s)[0]);
    assert.ok(edge(b["Thickest edge"]) > edge(a["Thickest edge"]) + 2, `−6.00 thicker than −2.00: ${JSON.stringify([a, b])}`);
    assert.ok(Number.parseFloat(b["Weight · one lens"]) > Number.parseFloat(a["Weight · one lens"]));
    assert.match(b["Colour fringing · edge"], /noticeable/);
    assert.equal(a["Front base curve"], "5 D");
    assert.match(await page.locator("#flFigB figcaption").innerText(), /New\n−6\.00 −1\.50 × 180° · OD/);
    assert.equal(await page.locator("#flFigA svg.lens-svg").count(), 1);
    assert.equal(await page.locator("#flFigA canvas.fringe-strip").count(), 2);
    assert.equal(await page.locator("#flNotes").isVisible(), true);

    // OS mirrors the drawing: the nasal marker moves to the left.
    const nasalX = () => page.locator("#flFigA .lens-tick").evaluate(t => Number(t.getAttribute("x")));
    const odX = await nasalX();
    await page.locator("#flEye").getByRole("radio", { name: "OS" }).click();
    await page.waitForFunction(() => !document.getElementById("flCompare").hidden && /OS/.test(document.querySelector("#flFigA figcaption").textContent));
    assert.ok(await nasalX() < odX, "OS nasal side on the left");
    await page.locator("#flEye").getByRole("radio", { name: "OD" }).click();

    // A plus Rx in a cat-eye: thick centre, edge held at 1.0 mm.
    await page.locator("#flShape").selectOption("cateye");
    await page.locator("#flRxASph").selectOption("");
    await page.locator("#flRxASph").evaluate(s => { s.dataset.sign = "1"; s.previousElementSibling.textContent = "+"; });
    await page.locator("#flRxASph").selectOption("4.00");
    await page.locator("#flShow").click();
    await page.locator("#flCompare").waitFor({ state: "visible" });
    const plus = await figures("flFigA");
    assert.ok(Number.parseFloat(plus.Centre) > 3, `+4.00 centre ${plus.Centre}`);
    assert.match(plus["Thinnest edge"], /^1\.0 mm/);

    // Bad frame numbers are named, not thrown.
    await page.locator("#flPd").fill("70");
    await page.locator("#flShow").click();
    assert.match(await page.locator("#flError").innerText(), /Monocular PD/);
    assert.equal(await page.locator("#flCompare").isVisible(), false);
    await page.locator("#flPd").fill("31");
    await page.locator("#flShow").click();
    await page.locator("#flCompare").waitFor({ state: "visible" });

    // ------------------------------------------------------------ layout
    for (const colorScheme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      for (const tool of ["#demoVisionTab", "#demoLensTab"]) {
        await page.locator(tool).click();
        for (const width of [320, 390, 1280]) {
          await page.setViewportSize({ width, height: 900 });
          await page.evaluate(() => document.fonts.ready.then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))));
          const o = await overflow(page);
          assert.ok(o.scroll <= width, `${colorScheme} ${tool} overflow at ${width}: ${JSON.stringify(o)}`);
          if (shots && width !== 320) await page.screenshot({ path: path.join(shots, `demotools-${tool.slice(5, -3).toLowerCase()}-${colorScheme}-${width}.png`), fullPage: true });
        }
      }
    }

    assert.equal(await page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort())), storageBefore, "Demotools stores nothing");
    assert.deepEqual(errors, []);
    console.log("PASS: Demotools True Vision and Frame/Lens Preview, light and dark, 320 px to desktop");
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
