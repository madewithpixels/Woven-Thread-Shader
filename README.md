# Woven Thread Hero

An animated hero background for the Voice Focus site: a woven silk-thread swirl drawn live in WebGL, with a lo-fi fallback that animates the original photo.

## What's here

```
demo/
  threads.html       Full hero demo: the procedural threads plus the settings panel in the section below
  photo-lofi.html    The lo-fi version: a gentle shader animating the swirl photo
  swirl.jpg          The source artwork (1400 × 2304)
src/
  threads.js         mwpThreads(): the procedural renderer (WebGL2)
  swirl-lofi.js      mwpSwirl(): the photo renderer (WebGL1)
  webflow-boot.js    Wires both renderers onto a Webflow element and adds the Tune panel
webflow/
  footer-code.html          Paste-ready <script> for Webflow custom code (~41 KB, under the 50 KB limit)
  woven-thread-hero.js      The same bundle, unminified and readable
  woven-thread-hero.min.js  The same bundle, minified
  test-page.html            Local page that mimics a Webflow hero, for testing the embed
  swirl.jpg                 Artwork used by the test page
```

To preview locally, serve the folder rather than opening the files directly, so the image loads over http:

```
cd Woven-Thread-Shader
python3 -m http.server 8000
# then open http://localhost:8000/webflow/test-page.html
```

## Adding it to Webflow

1. **Upload `swirl.jpg`** to the site's Assets and copy its URL.
2. **Select the hero Section** and, in Element settings > Custom attributes, add:

   | Name | Value |
   |---|---|
   | `data-woven-hero` | *(leave empty)* |
   | `data-woven-fallback` | the swirl.jpg asset URL |
   | `data-woven-controls` | *(leave empty; remove it before launch)* |
   | `data-woven-settings` | `{}`, or the JSON you copy from the panel |

3. **Paste `webflow/footer-code.html`** into Page settings > Custom code > Before `</body>` tag. You can use Site settings instead if the hero appears on several pages.
4. **Publish** to the staging domain. The script doesn't run in the Designer canvas.

The script adds the canvases as the section's first children, behind its content, so your Designer layout isn't touched. It sets `position: relative` (if the section is static) and `isolation: isolate` on the section so the canvases stay behind the content.

Keep a readability gradient behind the headline as you would normally: a div inside the hero, styled in the Designer, with a paper-coloured fade from the left.

## Tuning

With `data-woven-controls` on the section, the settings panel appears on the published page. If the page has an element with the attribute `data-woven-panel` (e.g. an empty div in the section under the hero), the panel sits inside it, always open. Otherwise a **Tune hero** button appears at the bottom right and opens it as a floating panel. The panel has:

- **Renderer switch:** Threads / Photo (lo-fi). The photo option needs `data-woven-fallback`.
- **Motion:** speed, flow, twist, shimmer, mouse tilt.
- **Path:** Loop, Waveform, Vortex, Braid or Bloom (switching morphs between them), morph time, spread and opening.
- **Position:** X and Y (as a share of the viewport, so ±1 moves the shape a full screen), zoom (0.25× to 3× about the shape's centre), turn, tilt and rotate (3D, in degrees), depth (perspective strength) and fog (how far strands fade into the paper).
- **Threads:** count, count on phones, thickness (strand width in CSS pixels), highlights (the thicker glossy white strands), opacity, warmth (red and orange strands), accents (gold and aqua).
- **Performance:** max fps (the frame cap) and target fps, with a live readout of the frame rate and quality level.
- **Colour:** hue shift, saturation, brightness, paper colour.
- **Photo framing** (photo mode only): shift y, art width.

**Copy** puts the settings you've changed on the clipboard as JSON. Paste that as the value of `data-woven-settings`, then publish. **Reset** returns to whatever is saved in that attribute.

To tune the live site without showing the button to visitors, remove `data-woven-controls` and add `?tune` to the page URL instead, e.g. `https://example.com/?tune`.

### Testing on real machines

Add `?perf` to the URL (e.g. `https://voice-focus.webflow.io/?perf`) to show a small stats box in the bottom-left corner: frame rate, cap and target, quality level, threads × points being drawn, canvas size and render scale, and the GPU name when the browser reveals it. `?perf` is visitor-safe to leave working; it only shows when asked for. Combine with `?tune` as `?tune&perf`.

## Paths

Each path is a family of 3D curves, chosen to carry a section's meaning:

| Path | Form | Could say |
|---|---|---|
| `loop` | The woven swirl from the original artwork: a twisted funnel crossing at a pinch | Turning, transformation |
| `wave` | Threads flowing across like a voiceprint, loudest at the centre | Voice itself |
| `vortex` | Spiralling in to a calm, open centre and out again | Focus, finding your centre |
| `braid` | Three coloured bundles weaving around each other | Connection, working together |
| `bloom` | Gathering at a narrow throat, then opening out | Opening up, projecting your voice |

Every thread runs its path and then carries on in a straight tail sized from the screen and zoom, so thread ends always land well off-screen, whatever the position settings. *Spread* and *Opening* adjust each path in its own way (fan and hole size for the loop, amplitude and band width for the waveform, and so on).

## Performance

**Frame cap.** The hero draws at most 30 frames a second by default (*Max fps*; 0 = uncapped). The motion is slow, so 30 looks almost the same as 60 and halves the GPU work, which matters for battery, fan noise and older laptops. Frames are scheduled on a running clock, so the cap holds exactly on 60, 75, 120 and 144 Hz screens alike.

**Quality ladder.** The hero measures its own frame rate once a second. If it falls below 90% of the target (default 60 fps, but never more than the cap, so effectively 30), it steps down a quality ladder, cheapest visual loss first:

1. **Resolution:** render scale 100% → 85% → 75% … 50%. Every strand is filled per pixel, so this is the biggest cost, and on retina screens the drop is barely visible.
2. **Thread count:** 100% → 85% → 70% … 40%.
3. **Points per thread:** 100% → 85% … 55%. Fewer points make slightly less smooth curves.

If it's back at the target for 6 seconds, it tries one step up. If that step fails straight away, it holds for 30 seconds before trying again, so it doesn't flicker between levels. Set the target to 0 to switch this off. Time in a background tab or with the hero scrolled off screen isn't counted.

Other savings built in: no MSAA (strands draw their own soft edges), one instanced draw per half-loop, and the white strands are a separate batch of about 0.8% of the threads.

## Behaviour and fallbacks

- The animation pauses while the hero is off screen, and visitors with *reduce motion* switched on see a still frame.
- Phones get fewer threads (1,000 by default, against 1,500 on desktop; set with *On phones*), and resolution is capped at 1.5× for performance.
- No WebGL2 → the lo-fi photo version runs instead (if `data-woven-fallback` is set).
- No WebGL at all, or the image fails to load → the section shows the swirl photo as a plain background image.
- The photo version loads the image with CORS. Webflow's asset CDN normally allows this; if the photo renderer ever stays blank, the plain background image still shows.

## Script API

Each hero element gets a controller:

```js
const hero = document.querySelector('[data-woven-hero]').__woven;
hero.set({ speed: 0.6, hue: -20 });   // change settings live
hero.get();                           // current settings
hero.pause(true);                     // pause / resume
hero.set({ path: 'braid' });          // morph to another path over morphTime seconds
hero.blend('loop', 'wave', 0.4);      // hold a morph part-way: the hook for scroll-driven section changes
```

`window.WovenThreadHero.init(el)` starts the hero on an element added after page load.

## Editing the source

Edit the files in `src/`, then rebuild the bundle:

```
cd Woven-Thread-Shader
{ echo "/*! Woven Thread Hero · madewithpixels */"; echo "(function(){'use strict';";
  cat src/swirl-lofi.js src/threads.js src/webflow-boot.js; echo "})();"; } > webflow/woven-thread-hero.js
npx terser webflow/woven-thread-hero.js -c -m --comments '/^!/' -o webflow/woven-thread-hero.min.js
{ echo "<script>"; cat webflow/woven-thread-hero.min.js; echo "</script>"; } > webflow/footer-code.html
```
