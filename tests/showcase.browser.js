#!/usr/bin/env node
// Showcase: Clarity renders both charts from a typed final Rx; Lens Studio edges two
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
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

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
    assert.equal(await page.locator("#showcaseTab").getAttribute("aria-selected"), "true");
    assert.equal(await page.locator("#showcasePanel").isVisible(), true);
    assert.equal(await page.evaluate(() => document.body.dataset.view), "showcase");
    assert.equal(await page.locator("#actionBar").isVisible(), false, "no case actions on Showcase");

    // ------------------------------------------------------------ Clarity
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
    await page.waitForFunction(() => /near, 40 cm/.test(document.getElementById("tvStatus").textContent));
    if (shots) await page.locator("#clarityForm").screenshot({ path: path.join(shots, "showcase-clarity.png") });

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

    // ------------------------------------------------------------ Lens Studio
    await page.locator("#lensStudioTab").click();
    assert.equal(await page.locator("#lensStudioForm").isVisible(), true);
    assert.equal(await page.locator("#clarityForm").isVisible(), false);
    assert.equal(await page.locator("#flEye").count(), 0, "both eyes at once, no eye switch");
    await page.locator("#flShow").click();
    assert.match(await page.locator("#flError").innerText(), /Current · OD/);
    const pick = async values => { for (const [id, value] of Object.entries(values)) await page.locator(`#${id}`).selectOption(value); };
    await pick({ flRxAOdSph: "2.00", flRxAOsSph: "2.25" });
    await page.locator("#flShow").click();
    assert.match(await page.locator("#flError").innerText(), /New · OD/, "every eye of both Rx is required");
    await pick({ flRxBOdSph: "6.00", flRxBOdCyl: "1.50", flRxBOdAx: "180", flRxBOsSph: "5.50" });
    await page.locator("#flShow").click();
    await page.locator("#flCompare").waitFor({ state: "visible" });

    // Per-eye figures: { label: [OD, OS] }
    const figures = id => page.locator(`#${id} .lens-table tbody`).evaluate(body => Object.fromEntries([...body.rows].map(r =>
      [r.cells[0].textContent, [...r.cells].slice(1).map(c => c.textContent)])));
    const a = await figures("flDataA"), b = await figures("flDataB");
    assert.deepEqual(a.Centre, ["1.0 mm", "1.0 mm"]);
    const mm = s => Number.parseFloat(s);
    for (const i of [0, 1]) assert.ok(mm(b["Thickest edge"][i]) > mm(a["Thickest edge"][i]) + 1.5, `stronger Rx, thicker edge: ${JSON.stringify([a, b])}`);
    assert.ok(mm(b.Pair[0]) > mm(a.Pair[0]));
    near(mm(a.Pair[0]), mm(a.Weight[0]) + mm(a.Weight[1]), 0.11, "pair weight is the sum");
    assert.equal(a["Base curve"][0], "5 D");
    assert.equal(await page.locator("#flDataB td.notice").count() > 0, true, "noticeable fringing is marked");
    assert.match(await page.locator("#flFigB figcaption").innerText(), /New\nOD −6\.00 −1\.50 × 180° · OS −5\.50 DS/);
    assert.equal(await page.locator("#flFigA svg.frame-svg").count(), 1);
    assert.equal(await page.locator("#flFigA .lens-band").count(), 2, "both lenses in one frame");
    assert.deepEqual(await page.locator("#flFigA .lens-tick").allTextContents(), ["OD", "OS"]);
    assert.equal(await page.locator("#flDataA canvas.fringe-strip").count(), 4);
    assert.equal(await page.locator("#flNotes").isVisible(), true);

    // As you face the wearer: OD on the left, OS on the right; both frames share one scale.
    const ticks = await page.locator("#flFigA .lens-tick").evaluateAll(t => t.map(n => Number(n.getAttribute("x"))));
    assert.ok(ticks[0] < 0 && ticks[1] > 0, `OD left, OS right: ${ticks}`);
    assert.equal(await page.locator("#flFigA svg").getAttribute("viewBox"), await page.locator("#flFigB svg").getAttribute("viewBox"));
    // Current sits directly above New.
    const boxA = await page.locator("#flFigA").boundingBox(), boxB = await page.locator("#flFigB").boundingBox();
    assert.ok(boxB.y >= boxA.y + boxA.height - 1 && Math.abs(boxA.x - boxB.x) < 1, "frames stacked, Current on top");

    // A plus Rx in a cat-eye: thick centre, edge held at 1.0 mm.
    await page.locator("#flShape").selectOption("cateye");
    for (const id of ["flRxAOdSph", "flRxAOsSph"]) {
      await page.locator(`#${id}`).evaluate(s => { s.dataset.sign = "1"; s.previousElementSibling.textContent = "+"; });
      await page.locator(`#${id}`).selectOption("4.00");
    }
    await page.locator("#flShow").click();
    await page.locator("#flCompare").waitFor({ state: "visible" });
    const plus = await figures("flDataA");
    assert.ok(mm(plus.Centre[0]) > 3 && mm(plus.Centre[1]) > 3, `+4.00 centre ${plus.Centre}`);
    assert.deepEqual(plus["Thinnest edge"], ["1.0 mm", "1.0 mm"]);

    // Bad frame numbers are named, not thrown.
    await page.locator("#flPdOs").fill("70");
    await page.locator("#flShow").click();
    assert.match(await page.locator("#flError").innerText(), /PD · OS/);
    assert.equal(await page.locator("#flCompare").isVisible(), false);
    await page.locator("#flPdOs").fill("31");
    await page.locator("#flShow").click();
    await page.locator("#flCompare").waitFor({ state: "visible" });

    // ------------------------------------------------------------ layout
    for (const colorScheme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      for (const tool of ["#clarityTab", "#lensStudioTab"]) {
        await page.locator(tool).click();
        for (const width of [320, 390, 1280]) {
          await page.setViewportSize({ width, height: 900 });
          await page.evaluate(() => document.fonts.ready.then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))));
          const o = await overflow(page);
          assert.ok(o.scroll <= width, `${colorScheme} ${tool} overflow at ${width}: ${JSON.stringify(o)}`);
          if (shots && width !== 320) await page.screenshot({ path: path.join(shots, `showcase-${tool === "#clarityTab" ? "clarity" : "lens-studio"}-${colorScheme}-${width}.png`), fullPage: true });
        }
      }
    }

    assert.equal(await page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort())), storageBefore, "Showcase stores nothing");
    assert.deepEqual(errors, []);
    console.log("PASS: Showcase Clarity and Lens Studio, light and dark, 320 px to desktop");
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
