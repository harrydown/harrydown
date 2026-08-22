(function () {
  "use strict";

  /* ------------------------------------------------------------- tuning */

  const SPAWN_DISTANCE = 160;   // px of travel before the next image
  const SPAWN_INTERVAL = 220;   // ms floor between images, however fast the cursor
  const LINGER         = 1100;  // ms an image stays once it is no longer the active one
  const IDLE_CLEAR     = 0;     // ms of stillness before the last image clears too (0 = it stays)
  const EDGE_PAD       = 24;    // keep images this far inside the viewport

  // Sizing. Each item's `w` in work.js is its width on a 1440px-wide window;
  // everything below scales that to the window in front of it, then caps it.
  const REF_WIDTH   = 1440;  // window width the `w` values are authored against
  const SCALE_MIN   = 0.72;  // never shrink past this on small laptops
  const SCALE_MAX   = 1.35;  // never grow past this on very large displays
  const MIN_WIDTH   = 200;   // px — below this the work stops reading
  const MAX_WIDTH   = 620;   // px — hard ceiling on a 27" display
  const MAX_VW      = 0.42;  // fraction of window width, desktop
  const MAX_VW_SM   = 0.78;  // fraction of window width, phones
  const MAX_VH      = 0.62;  // fraction of window height, keeps corners clear
  const SMALL_WIDTH = 700;   // px — below this the phone caps apply
  const IMAGE_DIR   = "images/";  // bare filenames in work.js resolve against this

  // With no `w` on an entry, every piece is sized to the same on-screen AREA,
  // so a wide landscape and a tall portrait carry equal visual weight rather
  // than equal width. AUTO_AREA is that area at REF_WIDTH: 340 x 340.
  const AUTO_AREA   = 340 * 340;
  const PORTRAIT_AT = 1.15;  // height/width above this reads as portrait
  const LANDSCAPE_AT = 0.87; // ...and below this, as landscape

  /* ------------------------------------------------------------ elements */

  const stage    = document.getElementById("stage");
  const cursor   = document.getElementById("cursor");
  const clientEl = document.getElementById("client");
  const projEl   = document.getElementById("project");
  const info     = document.getElementById("info");
  const contact  = document.getElementById("contact");

  /* --------------------------------------------------------------- state */

  let bag      = [];     // shuffled queue of WORK, refilled when it empties
  let lastItem = null;   // the piece that just showed, so it can't repeat
  let layer    = 1;      // z-index, always climbing so new sits above old
  let travel   = 0;      // px accumulated since the last spawn
  let lastX    = null;
  let lastY    = null;
  let lastTime = 0;      // timestamp of the last spawn
  let active   = null;   // the image currently on top
  let idleTimer = null;

  let infoOpen = false;  // contact screen covering the work

  // Pointer position is written on every move but only painted once per frame.
  let px = 0, py = 0, frame = null;

  /* ------------------------------------------------------------- preload */

  // A bare filename in work.js means "in the images folder" — without this a
  // missing prefix fails silently, captions and all.
  function resolveSrc(src) {
    return /^(?:[a-z]+:|\/|\.)/i.test(src) || src.indexOf("/") !== -1
      ? src
      : IMAGE_DIR + src;
  }

  WORK.forEach(function (item) {
    item.src = resolveSrc(item.src);
    item.file = item.src.split("/").pop();
  });

  // Kept so natural dimensions are known before the first spawn.
  const preloaded = Object.create(null);

  WORK.forEach(function (item) {
    const img = new Image();
    img.addEventListener("error", function () {
      console.warn("[work] image failed to load:", item.src);
    });
    img.src = item.src;
    preloaded[item.src] = img;
  });

  /* --------------------------------------------------------------- utils */

  function clamp(value, min, max) {
    // If the image is wider/taller than the space available, the bounds cross
    // over — centre it rather than pinning it to a negative edge.
    if (min > max) return (min + max) / 2;
    return value < min ? min : value > max ? max : value;
  }

  // height / width, from three sources in order of confidence: the generated
  // manifest, the decoded file, then a neutral guess.
  function ratioFor(item) {
    const known = typeof SIZES !== "undefined" && SIZES[item.file];
    if (known && known[0]) return known[1] / known[0];

    const pre = preloaded[item.src];
    if (pre && pre.naturalWidth) return pre.naturalHeight / pre.naturalWidth;

    return 1;
  }

  function orientationOf(ratio) {
    if (ratio > PORTRAIT_AT) return "portrait";
    if (ratio < LANDSCAPE_AT) return "landscape";
    return "square";
  }

  // Width the piece should render at in this window, capped by both axes so a
  // tall portrait can never run past the captions.
  function widthFor(item, vw, vh) {
    const ratio = ratioFor(item);

    // An explicit `w` in work.js wins; otherwise size by equal area.
    const base = item.w || Math.sqrt(AUTO_AREA / ratio);

    const scale = clamp(vw / REF_WIDTH, SCALE_MIN, SCALE_MAX);
    const widthCap = vw * (vw < SMALL_WIDTH ? MAX_VW_SM : MAX_VW);

    let w = Math.max(base * scale, MIN_WIDTH);
    return Math.min(w, MAX_WIDTH, widthCap, (vh * MAX_VH) / ratio);
  }

  // Random order, but every piece shows once before any repeats — a plain
  // random pick would clump and leave some work unseen for a long stretch.
  function nextItem() {
    if (!bag.length) {
      bag = WORK.slice();
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = bag[i];
        bag[i] = bag[j];
        bag[j] = tmp;
      }
      // Don't let the last piece of one shuffle open the next one.
      if (bag.length > 1 && bag[0] === lastItem) bag.push(bag.shift());
    }
    lastItem = bag.shift();
    return lastItem;
  }

  function retire(el) {
    if (!el) return;
    el.classList.remove("is-in");
    window.setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 800);
  }

  /* --------------------------------------------------------------- spawn */

  function spawn(x, y) {
    const item = nextItem();

    const img = document.createElement("img");
    img.className = "shot";
    img.src = item.src;
    img.alt = "";
    img.draggable = false;
    img.style.zIndex = layer++;

    const vw = window.innerWidth  || document.documentElement.clientWidth;
    const vh = window.innerHeight || document.documentElement.clientHeight;

    const width = widthFor(item, vw, vh);
    img.style.setProperty("--w", width + "px");
    img.dataset.orientation = orientationOf(ratioFor(item));

    // Only needed for a file missing from sizes.js — re-measure once it lands.
    if (!(typeof SIZES !== "undefined" && SIZES[item.file])) {
      img.addEventListener("load", function () {
        img.style.setProperty("--w", widthFor(item, vw, vh) + "px");
        img.dataset.orientation = orientationOf(ratioFor(item));
      }, { once: true });
    }

    // Nudge in from the edges so an image never spawns mostly off-screen.
    const half = width / 2;
    img.style.left = clamp(x, half + EDGE_PAD, vw - half - EDGE_PAD) + "px";
    img.style.top  = clamp(y, EDGE_PAD + 40, vh - EDGE_PAD - 40) + "px";

    stage.appendChild(img);
    // Force layout so the transition runs from the initial state.
    void img.offsetWidth;
    img.classList.add("is-in");

    // The previous image is no longer active — start its exit clock.
    const previous = active;
    if (previous) window.setTimeout(function () { retire(previous); }, LINGER);
    active = img;

    clientEl.textContent = item.client;
    projEl.textContent   = item.project;
    clientEl.classList.add("is-on");
    projEl.classList.add("is-on");

    // Optional: if the pointer stops for long enough, let the last image go too.
    window.clearTimeout(idleTimer);
    if (IDLE_CLEAR > 0) {
      idleTimer = window.setTimeout(function () {
        if (active === img) {
          retire(img);
          active = null;
          clientEl.classList.remove("is-on");
          projEl.classList.remove("is-on");
        }
      }, IDLE_CLEAR);
    }
  }

  /* ------------------------------------------------------- contact screen */

  function setInfo(open) {
    infoOpen = open;
    info.classList.toggle("is-open", open);
    info.setAttribute("aria-hidden", open ? "false" : "true");
    document.body.classList.toggle("info-open", open);
    contact.setAttribute("aria-expanded", open ? "true" : "false");
    contact.textContent = open ? "CLOSE" : "CONTACT";

    // Moving to the corner to close shouldn't drop an image on the way back.
    travel = 0;
    lastX = null;
    lastY = null;

    if (open) info.focus();
    else contact.focus();
  }

  contact.addEventListener("click", function () {
    setInfo(!infoOpen);
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && infoOpen) setInfo(false);
  });

  // Clicking the empty field around the text closes it too.
  info.addEventListener("click", function (e) {
    if (e.target === info) setInfo(false);
  });

  /* -------------------------------------------------------------- motion */

  function paint() {
    frame = null;
    cursor.style.transform = "translate3d(" + px + "px," + py + "px,0) translate(-50%,-50%)";
  }

  function track(x, y) {
    px = x;
    py = y;
    if (frame === null) frame = window.requestAnimationFrame(paint);

    // The cursor still moves while the contact screen is up; the work doesn't.
    if (infoOpen) return;

    if (lastX === null) { lastX = x; lastY = y; return; }

    travel += Math.hypot(x - lastX, y - lastY);
    lastX = x;
    lastY = y;

    const now = performance.now();
    if (travel >= SPAWN_DISTANCE && now - lastTime >= SPAWN_INTERVAL) {
      travel = 0;
      lastTime = now;
      spawn(x, y);
    }
  }

  window.addEventListener("mousemove", function (e) {
    document.body.classList.add("has-cursor");
    track(e.clientX, e.clientY);
  }, { passive: true });

  // Touch: a tap drops an image, a drag behaves like the cursor.
  window.addEventListener("touchmove", function (e) {
    const t = e.touches[0];
    if (t) track(t.clientX, t.clientY);
  }, { passive: true });

  window.addEventListener("touchstart", function (e) {
    const t = e.touches[0];
    if (!t) return;
    lastX = t.clientX;
    lastY = t.clientY;
    travel = 0;
    spawn(t.clientX, t.clientY);
  }, { passive: true });

  document.addEventListener("mouseleave", function () {
    document.body.classList.remove("has-cursor");
  });

  window.addEventListener("blur", function () {
    lastX = null;
    lastY = null;
    travel = 0;
  });
})();
