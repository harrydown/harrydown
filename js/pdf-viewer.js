/* Renders a portfolio PDF inside the site.
 *
 * PDF.js draws each page to a canvas, so the file is never handed to the
 * browser's PDF plugin — no Adobe chrome, and the page stays ours. It also
 * means we can see that the document was opened, which a bare .pdf link can't
 * tell us: a file is served with no page around it and no script to run.
 *
 * Config comes from data attributes on <body>, set by each page under /p/.
 */

import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/6.3.289/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/6.3.289/pdf.worker.min.mjs";

const RENDER_AHEAD = "600px";    // start rendering a page before it scrolls in
const KEEP_AHEAD   = "2400px";   // ...and throw its canvas away well past that
const MAX_SCALE    = 3;          // oversample cap — 3 stays sharp when zoomed
const RESIZE_WAIT  = 250;        // ms of quiet before re-rendering at a new size

// Device pixels per CSS pixel to paint. Browser zoom changes devicePixelRatio,
// which is what lets us re-render sharp instead of scaling up a stale bitmap.
function currentScale() {
  return Math.min(window.devicePixelRatio || 1, MAX_SCALE);
}

const doc    = document.getElementById("doc");
const status = document.getElementById("status");
const cursor = document.getElementById("cursor");

const file = document.body.dataset.pdf;
const slug = document.body.dataset.slug;

/* -------------------------------------------------------------- events */

function trackEvent(name, data) {
  try {
    if (window.umami && typeof window.umami.track === "function") {
      window.umami.track(name, data);
    }
  } catch (e) { /* analytics must never break the viewer */ }
}

const ref = new URLSearchParams(window.location.search).get("ref");

/* How far through did they actually get? Page 30 means far more than page 1. */
const milestones = [25, 50, 75, 100];
const reached = new Set();

function reportDepth(pageCount, pageNumber) {
  const percent = Math.round((pageNumber / pageCount) * 100);
  for (const mark of milestones) {
    if (percent >= mark && !reached.has(mark)) {
      reached.add(mark);
      trackEvent("pdf-read", { pdf: slug, depth: mark + "%", ref: ref || undefined });
    }
  }
}

/* --------------------------------------------------------------- render */

async function render() {
  let pdf;
  try {
    pdf = await pdfjsLib.getDocument({
      url: file,
      // Draw glyphs as vector paths rather than handing the embedded fonts to
      // the browser's font engine. The subset fonts in these decks declare
      // advance widths narrower than the glyphs, and the browser clips each
      // letter to that width — the right stem of every R, D, W and N was
      // being sliced flat. Paths cost some speed and are pixel-accurate.
      disableFontFace: true
    }).promise;
  } catch (e) {
    status.innerHTML =
      'THIS DOCUMENT COULD NOT BE DISPLAYED<br><a href="' + file + '">DOWNLOAD IT INSTEAD</a>';
    trackEvent("pdf-error", { pdf: slug });
    return;
  }

  status.remove();
  trackEvent("pdf-opened", { pdf: slug, pages: pdf.numPages, ref: ref || undefined });

  // Lay every page out first at its true aspect ratio, so the scrollbar is
  // correct immediately and nothing jumps as pages fill in.
  const frames = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const view = page.getViewport({ scale: 1 });

    const frame = document.createElement("div");
    frame.className = "page";
    frame.style.aspectRatio = view.width + " / " + view.height;
    frame.dataset.page = String(n);
    doc.appendChild(frame);
    frames.push({ frame, page, view, canvas: null, task: null, renderedAt: null });
  }

  async function draw(entry) {
    const width = entry.frame.clientWidth;
    const scale = currentScale();

    // Already painted at this size and density — nothing to do.
    if (entry.renderedAt === width * scale) return;
    if (entry.task) entry.task.cancel();

    entry.renderedAt = width * scale;
    const viewport = entry.page.getViewport({ scale: (width / entry.view.width) * scale });

    // Round up, never down: flooring can shave the last column or row of
    // pixels, which clips anything the page draws hard against its edge.
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);

    // A PDF page is paper. Where it has no opaque content — soft shadows,
    // masks, anything exported with transparency — PDF.js leaves the canvas
    // clear, and our dark page shows through and muddies it. Paint white
    // underneath, the way every PDF viewer does.
    entry.task = entry.page.render({
      canvasContext: canvas.getContext("2d"),
      viewport,
      background: "#ffffff"
    });
    try {
      await entry.task.promise;
    } catch (e) {
      entry.renderedAt = null;   // cancelled or failed — let it try again
      return;
    }
    entry.task = null;

    if (entry.canvas) entry.canvas.remove();
    entry.canvas = canvas;
    entry.frame.appendChild(canvas);
  }

  // A 37-page deck at 3x would hold hundreds of megabytes of canvas if we kept
  // every page painted, so pages far from the viewport give their bitmap back.
  function release(entry) {
    if (entry.task) { entry.task.cancel(); entry.task = null; }
    if (entry.canvas) { entry.canvas.remove(); entry.canvas = null; }
    entry.renderedAt = null;
  }

  const renderObserver = new IntersectionObserver(function (entries) {
    for (const item of entries) {
      if (!item.isIntersecting) continue;
      const entry = frames[Number(item.target.dataset.page) - 1];
      draw(entry);
      reportDepth(pdf.numPages, Number(item.target.dataset.page));
    }
  }, { rootMargin: RENDER_AHEAD });

  const keepObserver = new IntersectionObserver(function (entries) {
    for (const item of entries) {
      if (item.isIntersecting) continue;
      release(frames[Number(item.target.dataset.page) - 1]);
    }
  }, { rootMargin: KEEP_AHEAD });

  frames.forEach(function (entry) {
    renderObserver.observe(entry.frame);
    keepObserver.observe(entry.frame);
  });

  // Re-render at the new size after a resize or a browser-zoom change, so the
  // page is re-rasterised rather than a stale bitmap being scaled up.
  let resizeTimer = null;
  function refresh() {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(function () {
      frames.forEach(function (entry) {
        if (entry.canvas) draw(entry);
      });
    }, RESIZE_WAIT);
  }

  window.addEventListener("resize", refresh);
  if (window.matchMedia) {
    // Fires when browser zoom changes devicePixelRatio.
    window.matchMedia("(resolution: " + (window.devicePixelRatio || 1) + "dppx)")
      .addEventListener("change", refresh);
  }
}

render();

/* --------------------------------------------------------------- cursor */

const FINE_POINTER = !window.matchMedia ||
  window.matchMedia("(hover: hover) and (pointer: fine)").matches;

let px = 0, py = 0, frame = null;

function paint() {
  frame = null;
  cursor.style.transform =
    "translate3d(" + px + "px," + py + "px,0) translate(-50%,-50%)";
}

window.addEventListener("mousemove", function (e) {
  if (FINE_POINTER) document.body.classList.add("has-cursor");
  px = e.clientX;
  py = e.clientY;
  if (frame === null) frame = window.requestAnimationFrame(paint);
}, { passive: true });

document.addEventListener("mouseleave", function () {
  document.body.classList.remove("has-cursor");
});
