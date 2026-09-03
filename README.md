# harrydown.design

Static portfolio site. No build step — open `index.html` or serve the folder.

```bash
./tools/serve.py
```

(Plain `python3 -m http.server` works too, but the browser will cache your
edited JS and the page won't appear to change. `tools/serve.py` is the same
server with caching switched off.)

## Adding your work

1. Drop image files into `images/` (jpg, png, gif, svg, webp).
2. Edit `js/work.js` — one entry per piece:

```js
{ client: "ARC MAGAZINE", project: "ISSUE 04 — IDENTITY", src: "images/arc-01.jpg", w: 300 }
```

`w` is **optional**. Leave it off — as every entry now does — and the piece is
sized automatically from its own dimensions: each image gets the same on-screen
*area* regardless of orientation, so a 3:1 panorama and a tall portrait carry
equal visual weight instead of equal width. Add `w: 420` to any entry to
override it (that number is its width on a 1440px-wide window).

3. Run `./tools/scan-images.sh` so the new files' dimensions are recorded.
Images cycle in list order. The eight files currently in `images/` are
placeholders — delete them once your own work is in.

## Tuning the interaction

All in the block at the top of `js/main.js`:

| constant | default | what it does |
| --- | --- | --- |
| `SPAWN_DISTANCE` | `160` | px of cursor travel before the next image appears |
| `SPAWN_INTERVAL` | `220` | ms floor between images, however fast the cursor moves |
| `LINGER` | `1100` | ms an image stays after it stops being the active one |
| `IDLE_CLEAR` | `0` | ms of stillness before the last image clears too; `0` keeps it |
| `EDGE_PAD` | `24` | keeps images this far inside the viewport |

### Sizing

| constant | default | what it does |
| --- | --- | --- |
| `REF_WIDTH` | `1440` | window width the `w` values in `work.js` are authored against |
| `SCALE_MIN` / `SCALE_MAX` | `0.72` / `1.35` | how far `w` may shrink or grow with the window |
| `MIN_WIDTH` / `MAX_WIDTH` | `200` / `620` | absolute px floor and ceiling |
| `MAX_VW` | `0.42` | max share of window width, desktop |
| `MAX_VW_SM` | `0.78` | max share of window width, phones |
| `MAX_VH` | `0.62` | max share of window height — keeps the corner captions clear |

Roughly what that yields: 267×334 for a small portrait on a 13" laptop, 400×500
on a 24", 405×506 on a 27" 5K; a large landscape tops out at 620×349.

### Orientation

`tools/scan-images.sh` reads every file in `images/` and writes `js/sizes.js` —
a plain map of filename to `[width, height]`. Re-run it whenever you add or
replace an image; it also prints the landscape/portrait/square tally.

Baking the dimensions in means a piece is sized correctly on its first frame
rather than resizing once the file decodes. If a file is missing from the
manifest the site still works — it falls back to measuring the image on load.

Each image also carries a `data-orientation` attribute of `portrait`,
`landscape`, or `square`, so you can style by orientation from CSS:

```css
.shot[data-orientation="portrait"] { /* … */ }
```

Thresholds are `PORTRAIT_AT` / `LANDSCAPE_AT` in `main.js` (height ÷ width above
1.15, below 0.87).

### Exporting images

Export at **2× the largest size a piece will render** — around 1200px wide for
most, 1400px for the large landscapes. JPEG at q80 or WebP; aim under ~250KB
each so they're decoded before the cursor reaches them.

Cursor size and fade speeds are CSS variables at the top of `css/style.css`.

## Deploying

The asset URLs in `index.html` carry a `?v=2` query. Bump it when you deploy so
returning visitors don't get a stale stylesheet or script from cache.

## Contact screen

Clicking `CONTACT` covers the work with a full-screen panel (`.info` in
`index.html`) holding the discipline line, the services list, and the email
address, centred on both axes. It closes on `CLOSE`, or on `Escape`. Clicking the panel itself does nothing —
deliberately, so the screen can't be dismissed by accident. While it's open the work stops
generating, so moving the cursor doesn't pile up images behind it.

The address is not written in the HTML. The panel shows an `EMAIL ME` button;
`js/main.js` decodes the address from base64 on click and swaps in a real
`mailto:` link, so address-harvesting crawlers find nothing in the source. To
change it, update the base64 string in `js/main.js` (and the copy in the inline
script in `404.html`):

```bash
python3 -c "import base64; print(base64.b64encode(b'you@example.com').decode())"
```
