/* ============================================================
   Woven Thread Hero — Webflow boot + toggleable settings panel
   ------------------------------------------------------------
   On the hero element in Webflow, add custom attributes:

     data-woven-hero                 (required, no value)
     data-woven-settings  = {...}    (optional JSON from the panel's Copy button; per-breakpoint
                                      overrides go in "tablet", "landscape" and "portrait" objects)
     data-woven-fallback  = <url>    (optional: the swirl image asset URL, used for
                                      the lo-fi photo version and as a still fallback)
     data-woven-controls             (optional: shows the settings panel; it floats behind a Tune
                                      button, or sits inside any element marked data-woven-panel)
     data-woven-poster    = <url>    (optional: still image shown when the hero can't animate —
                                      software WebGL such as PageSpeed/Lighthouse, or no WebGL)
     data-woven-poster-portrait = <url>  (optional: the same for screens 767px wide and narrower)
     data-woven-software-fallback="false" / data-woven-defer-start="false"   (opt out per element;
                                      or site-wide with window.WovenThreadHeroConfig = {...})

   The panel can also be opened on any page by adding ?tune to the URL.
   ============================================================ */
(function(){
  var DEFAULTS = {
    path: 'loop', morphTime: 1.8,
    len_loop: 0.85, len_wave: 1, len_vortex: 1, len_braid: 1, len_bloom: 1,
    speed: 1, flow: 1.9, twist: 3, shimmer: 1.05, parallax: 2.85,
    fan: 1.11, hole: 1.42,
    threads: 1500, thickness: 1.35, highlights: 1.9, opacity: 1.02, warmth: 0.68, accents: 2.7,
    targetFps: 60, maxFps: 30,
    hue: 0, saturation: 0.83, brightness: 1, paper: '#efe1dc',
    xUnit: 'hero', yUnit: 'hero', zoom: 0.91,
    // the view, per shape: X, Y, Turn, Tilt, Rotate, Depth and Fog are remembered separately for each shape
    x_loop: 0.1, y_loop: 0.13, turn_loop: -27, tilt_loop: -6, rotate_loop: 10, depth_loop: 1.46, fog_loop: 2,
    x_wave: 0, y_wave: 0, turn_wave: 0, tilt_wave: 0, rotate_wave: 0, depth_wave: 0.6, fog_wave: 0.6,
    x_vortex: 0, y_vortex: 0, turn_vortex: 0, tilt_vortex: 0, rotate_vortex: 0, depth_vortex: 0.6, fog_vortex: 0.6,
    x_braid: 0, y_braid: 0, turn_braid: 0, tilt_braid: 0, rotate_braid: 0, depth_braid: 0.6, fog_braid: 0.6,
    x_bloom: 0, y_bloom: 0, turn_bloom: 0, tilt_bloom: 0, rotate_bloom: 0, depth_bloom: 0.6, fog_bloom: 0.6,
    focalY: 0.36, widthShare: 0.54
  };

  var CAMERA = ['x', 'y', 'turn', 'tilt', 'rotate', 'depth', 'fog'];   // remembered separately for each shape
  var GROUPS = [
    { name: 'Motion', both: true, items: [
      ['speed', 'Speed', 0, 2, 0.05], ['flow', 'Flow', 0, 3, 0.05], ['twist', 'Twist', 0, 5, 0.05],
      ['shimmer', 'Shimmer', 0, 2, 0.05], ['parallax', 'Mouse tilt', 0, 3, 0.05, null, true] ]},
    { name: 'Path', items: [ ['path', 'Path', 'path'], ['length', 'Length', 'len'], ['morphTime', 'Morph time', 0.3, 5, 0.1, 1],
      ['fan', 'Spread', 0.5, 1.8, 0.01], ['hole', 'Opening', 0.4, 2.4, 0.01] ]},
    { name: 'View (per shape)', items: [
      ['x', 'X', 'unit'], ['y', 'Y', 'unit'],
      ['turn', 'Turn', -70, 70, 1, 0], ['tilt', 'Tilt', -70, 70, 1, 0], ['rotate', 'Rotate', -180, 180, 1, 0],
      ['depth', 'Depth', 0, 1.5, 0.01], ['fog', 'Fog', 0, 2, 0.01], ['zoom', 'Zoom (all shapes)', 0.25, 3, 0.01] ]},
    { name: 'Threads', items: [
      ['threads', 'Count', 400, 4000, 100, 0],
      ['thickness', 'Thickness', 0.4, 3, 0.05], ['highlights', 'Highlights', 0, 4, 0.1],
      ['opacity', 'Opacity', 0.3, 1.6, 0.01], ['warmth', 'Warmth', 0, 1, 0.01], ['accents', 'Accents', 0, 3, 0.05] ]},
    { name: 'Colour', items: [
      ['hue', 'Hue shift', -180, 180, 1, 0], ['saturation', 'Saturation', 0, 1.6, 0.01],
      ['brightness', 'Brightness', 0.6, 1.3, 0.01], ['paper', 'Paper', 'color'] ]},
    { name: 'Performance', items: [ ['maxFps', 'Max fps', 0, 60, 5, 'fps'], ['targetFps', 'Target fps', 0, 60, 5, 'fps'] ]},
    { name: 'Photo framing', photo: true, items: [
      ['focalY', 'Shift y', 0, 1, 0.01], ['widthShare', 'Art width', 0.3, 1, 0.01] ]}
  ];
  var SWIRL_KEYS = ['speed', 'flow', 'twist', 'shimmer', 'focalY', 'widthShare'];
  // Webflow's own breakpoints (desktop-first). Overrides cascade down: a tablet value also applies
  // to both mobile sizes unless they set their own, just like styles in the Designer.
  var BPS = [
    { id: 'desktop',   label: 'Desktop',          max: 0 },
    { id: 'tablet',    label: 'Tablet',           max: 991 },
    { id: 'landscape', label: 'Mobile landscape', max: 767 },
    { id: 'portrait',  label: 'Mobile portrait',  max: 479 }
  ];
  var PHONE_MAX_THREADS = 1000;                             // phones draw at most this many threads unless told otherwise
  // X/Y units: slider range and step for each, and how many CSS px one unit is
  var UNIT_RANGE = { hero: [-1, 1, 0.01], vw: [-100, 100, 0.5], vh: [-100, 100, 0.5], svh: [-100, 100, 0.5], px: [-1600, 1600, 1] };
  var UNITS = { x: [['hero', '%'], ['vw', 'vw'], ['px', 'px']], y: [['hero', '%'], ['svh', 'svh'], ['vh', 'vh'], ['px', 'px']] };   // % = share of the hero
  var svhCss = 0;
  function measureSvh(){
    var d = document.createElement('div');
    d.style.cssText = 'position:fixed;top:0;left:0;width:0;height:100svh;visibility:hidden;pointer-events:none';
    document.body.appendChild(d); svhCss = d.offsetHeight || innerHeight; d.remove();
  }
  function fmtUnit(v, unit){
    if (unit === 'hero') return Math.round(v*100) + '%';
    if (unit === 'px') return Math.round(v) + '';
    return (+v).toFixed(1);
  }
  var PATH_NAMES = [['loop', 'Loop'], ['wave', 'Waveform'], ['vortex', 'Vortex'], ['braid', 'Braid'], ['bloom', 'Bloom']];

  var CSS = '\
.wth-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;z-index:-1;pointer-events:none;transition:opacity .9s ease}\
.wth-canvas[hidden]{display:none}\
.wth-toggle{position:fixed;right:16px;bottom:16px;z-index:2147483000;border:0;border-radius:999px;padding:10px 18px;background:#2a1e31;color:#f6eeea;font:500 13px/1 system-ui,-apple-system,"Segoe UI",sans-serif;cursor:pointer;box-shadow:0 6px 20px rgba(42,30,49,.25)}\
.wth-panel{position:fixed;right:16px;bottom:64px;max-height:calc(100vh - 80px);z-index:2147483000;width:min(300px,calc(100vw - 32px));display:flex;flex-direction:column;border-radius:14px;background:rgba(250,244,241,.92);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);box-shadow:0 12px 40px rgba(42,30,49,.2);font:13px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;color:#2a1e31;text-align:left}\
.wth-panel[hidden]{display:none}\
.wth-panel *{box-sizing:border-box}\
.wth-head{padding:14px 16px 10px}\
.wth-seg{display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:3px;border-radius:999px;background:rgba(42,30,49,.08)}\
.wth-seg button{border:0;border-radius:999px;background:transparent;padding:7px 10px;font:500 12px system-ui,sans-serif;color:#2a1e31;cursor:pointer}\
.wth-seg button[aria-pressed="true"]{background:#2a1e31;color:#f6eeea}\
.wth-seg button:disabled{opacity:.4;cursor:not-allowed}\
.wth-body{flex:1;overflow-y:auto;padding:0 16px 8px;overscroll-behavior:contain}\
.wth-group{border-top:1px solid rgba(42,30,49,.1);padding:10px 0 4px}\
.wth-group[hidden],.wth-row[hidden]{display:none}\
.wth-group h3{margin:0 0 8px;font:600 11px system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#5e2a6e}\
.wth-row{display:grid;grid-template-columns:76px 1fr 40px;align-items:center;gap:10px;margin:0 0 6px}\
.wth-row label{font:inherit;color:inherit;margin:0}\
.wth-row output{text-align:right;font-variant-numeric:tabular-nums;color:#5b4a60}\
.wth-row input[type=range]{width:100%;margin:0;accent-color:#5e2a6e}\
.wth-row input[type=color]{width:100%;height:24px;border:1px solid rgba(42,30,49,.2);border-radius:6px;background:transparent;padding:0 2px}\
.wth-foot{display:flex;gap:6px;padding:10px 16px 6px;border-top:1px solid rgba(42,30,49,.1)}\
.wth-foot button{flex:1;border:1px solid rgba(42,30,49,.2);background:transparent;border-radius:999px;padding:7px 8px;font:500 12px system-ui,sans-serif;color:#2a1e31;cursor:pointer}\
.wth-foot button.wth-primary{background:#2a1e31;color:#f6eeea;border-color:#2a1e31}\
 .wth-perf{margin:2px 0 4px;font-size:12px;color:#5b4a60;font-variant-numeric:tabular-nums}\
.wth-stats{position:fixed;left:12px;bottom:12px;z-index:2147483000;margin:0;padding:8px 10px;border-radius:8px;background:rgba(20,14,24,.82);color:#f6eeea;font:11px/1.45 ui-monospace,Menlo,Consolas,monospace;white-space:pre;pointer-events:none}\
.wth-pathrow{grid-template-columns:76px 1fr}\
.wth-pathrow .wth-lbl{align-self:start;padding-top:5px}\
.wth-pathset{display:flex;flex-wrap:wrap;gap:4px}\
.wth-pathset button{border:1px solid rgba(42,30,49,.2);background:transparent;border-radius:999px;padding:4px 9px;font:500 12px system-ui,sans-serif;color:#2a1e31;cursor:pointer}\
.wth-pathset button[aria-pressed="true"]{background:#2a1e31;color:#f6eeea;border-color:#2a1e31}\
.wth-panel.wth-inline{position:static;width:auto;max-height:none;margin-top:32px;backdrop-filter:none;-webkit-backdrop-filter:none;background:#f7efeb;border:1px solid rgba(42,30,49,.1);box-shadow:none}\
.wth-inline .wth-head{padding:16px 20px;border-bottom:1px solid rgba(42,30,49,.1)}\
.wth-inline .wth-seg{max-width:280px}\
.wth-inline .wth-body{display:flex;flex-wrap:wrap;column-gap:28px;padding:8px 20px 4px;overflow:visible}\
.wth-inline .wth-group{flex:1 1 210px;max-width:330px;border-top:0}\
.wth-inline .wth-foot{padding:12px 20px}\
.wth-inline .wth-foot button{flex:0 0 auto;padding:8px 16px}\
.wth-inline .wth-bpbar{margin-top:10px}\
.wth-bps{display:flex;flex-wrap:wrap;gap:6px}\
.wth-bps span{font-size:11px;padding:3px 9px;border-radius:999px;border:1px solid rgba(42,30,49,.15);color:#5b4a60;white-space:nowrap}\
.wth-bps span[aria-current="true"]{background:#5e2a6e;border-color:#5e2a6e;color:#fff}\
.wth-bps em{font-style:normal;margin-left:5px;padding:0 5px;border-radius:999px;background:rgba(42,30,49,.1)}\
.wth-bps span[aria-current="true"] em{background:rgba(255,255,255,.25)}\
.wth-hint{margin:8px 0 0;font-size:12px;line-height:1.45;color:#5b4a60}\
.wth-lcell{display:flex;align-items:center;gap:4px;min-width:0}\
.wth-ovr label,.wth-ovr .wth-lbl{color:#5e2a6e;font-weight:600}\
.wth-clear{flex:0 0 auto;width:16px;height:16px;padding:0;border:0;border-radius:50%;background:#5e2a6e;color:#fff;font:600 11px/16px system-ui,sans-serif;cursor:pointer}\
.wth-clear[hidden]{display:none}\
.wth-titlebar{display:flex;align-items:center;gap:8px;padding:10px 12px 10px 16px;border-bottom:1px solid rgba(42,30,49,.1);user-select:none;-webkit-user-select:none}\
.wth-titlebar strong{flex:1;font:600 11px system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#5b4a60}\
.wth-titlebar button{border:1px solid rgba(42,30,49,.2);background:transparent;border-radius:999px;padding:4px 10px;font:500 12px system-ui,sans-serif;color:#2a1e31;cursor:pointer}\
.wth-titlebar button[data-act="min"]{width:28px;padding:4px 0}\
.wth-titlebar button[hidden]{display:none}\
.wth-grip{display:none;width:10px;height:14px;background-image:radial-gradient(circle,#8a7a8e 1.2px,transparent 1.4px);background-size:5px 5px}\
.wth-float .wth-titlebar{cursor:grab;touch-action:none}\
.wth-float .wth-titlebar:active{cursor:grabbing}\
.wth-float .wth-grip{display:block}\
.wth-panel.wth-float{width:min(340px,calc(100vw - 16px));max-height:calc(100vh - 16px)}\
.wth-min .wth-head,.wth-min .wth-body,.wth-min .wth-foot,.wth-min .wth-note{display:none}\
.wth-panel.wth-min{max-height:none}\
.wth-unitrow{grid-template-columns:76px 1fr 44px 54px}\
.wth-unitrow select{width:100%;font:12px system-ui,sans-serif;color:#2a1e31;background:transparent;border:1px solid rgba(42,30,49,.2);border-radius:6px;padding:2px 4px}\
.wth-note{padding:0 20px 14px}\
.wth-titlebar{display:flex;align-items:center;gap:8px;padding:10px 12px 10px 16px;border-bottom:1px solid rgba(42,30,49,.1);user-select:none;-webkit-user-select:none}\
.wth-titlebar strong{flex:1;font:600 11px system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#5b4a60}\
.wth-titlebar button{border:1px solid rgba(42,30,49,.2);background:transparent;border-radius:999px;padding:4px 10px;font:500 12px system-ui,sans-serif;color:#2a1e31;cursor:pointer}\
.wth-titlebar button[data-act="min"]{width:28px;padding:4px 0}\
.wth-titlebar button[hidden]{display:none}\
.wth-grip{display:none;width:10px;height:14px;background-image:radial-gradient(circle,#8a7a8e 1.2px,transparent 1.4px);background-size:5px 5px}\
.wth-float .wth-titlebar{cursor:grab;touch-action:none}\
.wth-float .wth-titlebar:active{cursor:grabbing}\
.wth-float .wth-grip{display:block}\
.wth-panel.wth-float{width:min(340px,calc(100vw - 16px));max-height:calc(100vh - 16px)}\
.wth-min .wth-head,.wth-min .wth-body,.wth-min .wth-foot,.wth-min .wth-note{display:none}\
.wth-panel.wth-min{max-height:none}\
.wth-unitrow{grid-template-columns:76px 1fr 44px 54px}\
.wth-unitrow select{width:100%;font:12px system-ui,sans-serif;color:#2a1e31;background:transparent;border:1px solid rgba(42,30,49,.2);border-radius:6px;padding:2px 4px}\
.wth-note{margin:0;padding:0 16px 12px;min-height:16px;font-size:12px;color:#1d6f6b}\
.wth-note textarea{width:100%;height:100px;margin-top:6px;font:11px/1.4 ui-monospace,Menlo,monospace;border-radius:6px;border:1px solid rgba(42,30,49,.2);padding:6px}\
.wth-panel :focus-visible,.wth-toggle:focus-visible{outline:2px solid #1d6f6b;outline-offset:2px}\
@media (max-width:760px){.wth-panel{max-height:62vh}}';

  function injectCSS(){
    if (document.getElementById('wth-css')) return;
    var st = document.createElement('style'); st.id = 'wth-css'; st.textContent = CSS;
    document.head.appendChild(st);
  }
  function fmt(v, dp){
    if (dp === 'fps') return v ? String(Math.round(v)) : 'Off';
    return dp === 0 ? String(Math.round(v)) : (+v).toFixed(dp == null ? 2 : dp);
  }

  function round(v){ return typeof v === 'number' ? +v.toFixed(3) : v; }
  function copyObj(o){ return JSON.parse(JSON.stringify(o)); }

  // Paint-safe start (v1.5). PageSpeed / Lighthouse and Googlebot render headless with no GPU, so
  // WebGL runs on the CPU (SwiftShader, llvmpipe…) and an animated canvas starves the main thread.
  // On a software renderer, or with no WebGL at all, the hero shows its still poster instead.
  var CFG = window.WovenThreadHeroConfig || {};
  function flag(el, attr, key, def){
    var a = el.getAttribute(attr);
    if (a !== null) return a !== 'false';
    return key in CFG ? !!CFG[key] : def;
  }
  var SOFTWARE_GL_RE = /swiftshader|llvmpipe|softpipe|software|basic render/i, glCheck;
  function softwareGL(){                                       // '' for a hardware GPU, otherwise the reason
    if (glCheck !== undefined) return glCheck;
    glCheck = '';
    try {
      var c = document.createElement('canvas');
      var gl = c.getContext('webgl2') || c.getContext('webgl');
      if (!gl) glCheck = 'no WebGL';
      else {
        var name = String(gl.getParameter(gl.RENDERER) || '');
        var ext = gl.getExtension('WEBGL_debug_renderer_info');
        if (ext) name += ' | ' + String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
        if (SOFTWARE_GL_RE.test(name)) glCheck = name;
        var lose = gl.getExtension('WEBGL_lose_context'); lose && lose.loseContext();
      }
    } catch (e) { glCheck = 'WebGL check failed'; }
    return glCheck;
  }
  var staticNoticeShown = false;
  function posterFor(el, fallback){
    var narrowNow = window.matchMedia('(max-width: 767px)').matches;
    return (narrowNow && el.getAttribute('data-woven-poster-portrait')) || el.getAttribute('data-woven-poster') || fallback;
  }
  function showPoster(el, fallback){
    var url = posterFor(el, fallback);
    if (!url) return;
    el.style.backgroundImage = 'url("' + url + '")';
    el.style.backgroundRepeat = 'no-repeat';
    el.style.backgroundSize = 'cover';
    el.style.backgroundPosition = 'center';
  }
  function staticHero(el, fallback, reason){
    el.classList.add('wth-static');
    showPoster(el, fallback);
    window.addEventListener('resize', function(){ showPoster(el, fallback); }, { passive: true });
    if (!staticNoticeShown){
      staticNoticeShown = true;
      console.info('[woven] software WebGL (' + reason + ') — showing the still poster. ' +
        'Add data-woven-software-fallback="false" to animate anyway.');
    }
    var noop = function(){};
    el.__woven = { static: true, set: noop, get: function(){ return {}; }, breakpoint: noop, settings: function(){ return {}; }, blend: noop, pause: noop };
    ready(el, true);
  }
  function ready(el, isStatic){
    setTimeout(function(){
      el.dispatchEvent(new CustomEvent('woven:ready', { bubbles: true, detail: { instance: el.__woven, static: isStatic } }));
    }, 0);
  }
  // deferStart: build the renderer once the page has loaded and the browser is idle, so the shader
  // compile and first frames don't compete with the page's first paint
  function whenSettled(defer, fn){
    if (!defer) return fn();
    var go = function(){ (window.requestIdleCallback || function(f){ return setTimeout(f, 1); })(fn, { timeout: 1500 }); };
    if (document.readyState === 'complete') go(); else window.addEventListener('load', go, { once: true });
  }

  function init(el){
    if (el.__woven || el.__wovenPending) return;
    var saved = {};
    try { saved = JSON.parse(el.getAttribute('data-woven-settings') || '{}'); }
    catch (e) { console.warn('[woven] data-woven-settings is not valid JSON', e); }

    // split saved settings into layers: desktop values at the top level, one object per smaller breakpoint
    var layers = { desktop: {}, tablet: {}, landscape: {}, portrait: {} };
    Object.keys(saved).forEach(function(k){
      if (layers[k] && k !== 'desktop' && typeof saved[k] === 'object') layers[k] = Object.assign({}, saved[k]);
      else if (k === 'mobileThreads') layers.landscape.threads = layers.landscape.threads || saved[k];   // older saved settings
      else layers.desktop[k] = saved[k];
    });
    Object.keys(layers).forEach(function(b){
      CAMERA.forEach(function(k){
        if (!(k in layers[b])) return;
        PATH_NAMES.forEach(function(p){ if (!((k + '_' + p[0]) in layers[b])) layers[b][k + '_' + p[0]] = layers[b][k]; });
        delete layers[b][k];
      });
    });
    var savedLayers = copyObj(layers);

    function currentBp(){
      for (var i = BPS.length - 1; i > 0; i--) if (window.matchMedia('(max-width: ' + BPS[i].max + 'px)').matches) return BPS[i].id;
      return 'desktop';
    }
    function effective(id){
      var s = Object.assign({}, DEFAULTS);
      for (var i = 0; i < BPS.length; i++){
        var b = BPS[i].id;
        if (b === 'landscape' && !('threads' in layers.landscape)) s.threads = Math.min(s.threads, PHONE_MAX_THREADS);
        Object.assign(s, layers[b]);
        if (b === id) break;
      }
      return s;
    }
    var bp = currentBp();
    var state = effective(bp);

    var fallback = el.getAttribute('data-woven-fallback');
    var ctrlAttr = el.getAttribute('data-woven-controls');
    var showControls = (ctrlAttr !== null && ctrlAttr !== 'false') || /[?&]tune(=|&|$)/.test(location.search);
    var showPerf = /[?&]perf(=|&|$)/.test(location.search);        // ?perf: live stats overlay for testing on real machines
    var narrow = function(){ return window.matchMedia('(max-width: 767px)').matches; };

    injectCSS();
    if (flag(el, 'data-woven-software-fallback', 'softwareFallback', true)){
      var why = softwareGL();
      if (why) return staticHero(el, fallback, why);
    }
    var deferred = flag(el, 'data-woven-defer-start', 'deferStart', true);
    el.__wovenPending = true;
    whenSettled(deferred, function(){
    el.__wovenPending = false;
    // the canvases sit behind the hero's own content without touching its children
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    el.style.isolation = 'isolate';
    var cThreads = document.createElement('canvas'), cSwirl = document.createElement('canvas');
    cThreads.className = cSwirl.className = 'wth-canvas';
    cThreads.setAttribute('aria-hidden', 'true'); cSwirl.setAttribute('aria-hidden', 'true');
    cSwirl.hidden = true;
    el.insertBefore(cSwirl, el.firstChild); el.insertBefore(cThreads, el.firstChild);

    var threads = null, perfOut = null, perfBox = null, panelUi = null;
    function threadOpts(){
      return Object.assign({ maxDpr: 1.5, onPerf: function(p){
        var q = p.level ? 'quality stepped down ' + p.level + ' of ' + p.levels : 'full quality';
        if (perfOut) perfOut.textContent = p.fps + ' fps · ' + q;
        if (perfBox) perfBox.textContent =
          p.fps + ' fps (cap ' + (state.maxFps || 'off') + ', target ' + (state.targetFps || 'off') + ')\n' + q + '\n' +
          p.threads + ' threads × ' + p.points + ' points\n' +
          p.width + '×' + p.height + ' px at ' + p.scale.toFixed(2) + '× (screen ' + (window.devicePixelRatio || 1) + '×)\n' +
          'breakpoint: ' + bp + '\n' + (p.gpu || 'GPU name hidden by browser');
      } }, state);
    }
    if (showPerf){
      perfBox = document.createElement('pre'); perfBox.className = 'wth-stats'; perfBox.textContent = 'Measuring…';
      document.body.appendChild(perfBox);
    }
    if (deferred) cThreads.style.opacity = cSwirl.style.opacity = '0';   // fade in rather than pop
    try { threads = mwpThreads(cThreads, threadOpts()); } catch (e) { console.warn('[woven]', e); }
    var swirl = null, mode = threads ? 'threads' : 'photo', paused = false;

    function startSwirl(){
      if (swirl || !fallback) return;
      var o = { src: fallback }; SWIRL_KEYS.forEach(function(k){ o[k] = state[k]; });
      try { swirl = mwpSwirl(cSwirl, o); } catch (e) { console.warn('[woven]', e); }
    }
    if (threads) el.style.backgroundImage = 'none';
    else if (fallback){ cThreads.hidden = true; cSwirl.hidden = false; startSwirl(); }
    if (!threads && !swirl) showPoster(el, fallback);              // no WebGL renderer at all: the still
    if (deferred) requestAnimationFrame(function(){ requestAnimationFrame(function(){ cThreads.style.opacity = cSwirl.style.opacity = ''; }); });

    function apply(v){
      threads && threads.set(v);
      if (swirl){ var s = {}; SWIRL_KEYS.forEach(function(k){ if (k in v) s[k] = v[k]; }); swirl.set(s); }
    }
    // move to whatever the effective settings are for the current breakpoint, changing only what differs
    function refresh(){
      var ns = effective(bp), diff = {}, any = false;
      Object.keys(ns).forEach(function(k){ if (ns[k] !== state[k]){ diff[k] = ns[k]; any = true; } });
      state = ns;
      if (any) apply(diff);
      panelUi && panelUi.syncAll();
    }
    // follow the viewport across breakpoints
    BPS.slice(1).forEach(function(b){
      var mq = window.matchMedia('(max-width: ' + b.max + 'px)');
      var onChange = function(){ var nb = currentBp(); if (nb !== bp){ bp = nb; refresh(); } };
      mq.addEventListener ? mq.addEventListener('change', onChange) : mq.addListener(onChange);
    });
    window.addEventListener('resize', function(){ var nb = currentBp(); if (nb !== bp){ bp = nb; refresh(); } }, { passive: true });   // backup for slow frames

    var api = {
      set: function(v){ Object.assign(state, v); apply(v); },          // runtime changes (not saved to a breakpoint)
      get: function(){ return Object.assign({}, state); },
      breakpoint: function(){ return bp; },
      settings: function(){ return copyObj(layers); },
      blend: function(a, b, m){ threads && threads.blend(a, b, m); },   // hold a morph part-way (for scroll-driven sections)
      pause: function(p){ paused = !!p; threads && threads.pause(paused || mode !== 'threads'); swirl && swirl.pause(paused || mode !== 'photo'); }
    };
    el.__woven = api;
    if (showControls) buildPanel();
    ready(el, false);

    function buildPanel(){
      var btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'wth-toggle'; btn.textContent = 'Tune hero';
      btn.setAttribute('aria-expanded', 'false');
      var panel = document.createElement('aside');
      panel.className = 'wth-panel'; panel.hidden = true; panel.setAttribute('aria-label', 'Hero settings');
      panel.innerHTML =
        '<div class="wth-titlebar"><span class="wth-grip" aria-hidden="true"></span><strong>Hero settings</strong>' +
        '<button type="button" data-act="float">Pop out</button><button type="button" data-act="min" aria-label="Minimise" aria-expanded="true">–</button></div>' +
        '<div class="wth-head"><div class="wth-seg" role="group" aria-label="Renderer">' +
        '<button type="button" data-mode="threads">Threads</button><button type="button" data-mode="photo">Photo (lo-fi)</button>' +
        '</div><div class="wth-bpbar"><div class="wth-bps" aria-label="Breakpoints"></div><p class="wth-hint"></p></div></div>' +
        '<div class="wth-body"></div>' +
        '<div class="wth-foot"><button type="button" data-act="pause">Pause</button><button type="button" data-act="reset">Reset</button>' +
        '<button type="button" data-act="copy" class="wth-primary">Copy</button></div><p class="wth-note" role="status"></p>';
      var body = panel.querySelector('.wth-body'), note = panel.querySelector('.wth-note');
      var bpsEl = panel.querySelector('.wth-bps'), hint = panel.querySelector('.wth-hint');
      var rows = {};

      function bpLabel(id){ for (var i = 0; i < BPS.length; i++) if (BPS[i].id === id) return BPS[i]; }
      // write a value into the breakpoint being edited
      function setVal(k, v){
        layers[bp][k] = v;
        refresh();
      }
      function clearVal(k){
        delete layers[bp][k];
        var ax = /^([xy])_/.exec(k);                                // drop the unit too once no shape overrides that axis here
        if (ax && !PATH_NAMES.some(function(p){ return (ax[1] + '_' + p[0]) in layers[bp]; })) delete layers[bp][ax[1] + 'Unit'];
        refresh();
      }
      function syncRow(k){
        var r = rows[k]; if (!r) return;
        var kk = r.key ? r.key() : k;
        var own = bp !== 'desktop' && (Object.prototype.hasOwnProperty.call(layers[bp], kk) || (!!r.unitKey && Object.prototype.hasOwnProperty.call(layers[bp], r.unitKey)));
        r.row.classList.toggle('wth-ovr', own);
        r.clear.hidden = !own;
        if (r.sync) r.sync();
        else { r.input.value = state[k]; if (r.out) r.out.value = fmt(state[k], r.dp); }
      }
      function updateBpUi(){
        bpsEl.innerHTML = BPS.map(function(b){
          var n = Object.keys(layers[b.id]).filter(function(k){ return !/Unit$/.test(k) || !((k.replace('Unit', '')) in layers[b.id]); }).length;
          return '<span' + (b.id === bp ? ' aria-current="true"' : '') + '>' + b.label + (b.max ? ' ≤' + b.max : '') +
            (n ? '<em>' + n + '</em>' : '') + '</span>';
        }).join('');
        var cur = bpLabel(bp);
        hint.innerHTML = bp === 'desktop'
          ? 'Editing <b>Desktop</b>, the base for every screen size. Narrow the window to edit a smaller breakpoint.'
          : 'Editing <b>' + cur.label + '</b> (' + cur.max + 'px and below). ' +
            (bp !== 'portrait' ? 'Changes here also apply to smaller breakpoints unless they set their own. ' : '') +
            'Marked settings are overridden here; × clears one.';
      }
      panelUi = { syncAll: function(){ Object.keys(rows).forEach(syncRow); updateBpUi(); } };

      GROUPS.forEach(function(g){
        var grp = document.createElement('div');
        grp.className = 'wth-group'; if (g.both) grp.setAttribute('data-both', ''); if (g.photo) grp.setAttribute('data-photo', '');
        grp.innerHTML = '<h3>' + g.name + '</h3>';
        g.items.forEach(function(it){
          var k = it[0], id = 'wth-' + k, row = document.createElement('div');
          row.className = 'wth-row';
          var clearBtn = '<button type="button" class="wth-clear" hidden aria-label="Clear this override">×</button>';
          if (it[2] === 'path'){                                    // one button per path
            row.className = 'wth-row wth-pathrow';
            row.innerHTML = '<span class="wth-lcell"><span class="wth-lbl" id="wth-lbl-path">' + it[1] + '</span>' + clearBtn + '</span><div class="wth-pathset" role="group" aria-labelledby="wth-lbl-path">' +
              PATH_NAMES.map(function(p){ return '<button type="button" data-path="' + p[0] + '">' + p[1] + '</button>'; }).join('') + '</div>';
            var btns = row.querySelectorAll('[data-path]');
            btns.forEach(function(b){ b.addEventListener('click', function(){ setVal('path', b.getAttribute('data-path')); }); });
            rows[k] = { row: row, clear: row.querySelector('.wth-clear'), sync: function(){
              btns.forEach(function(b){ b.setAttribute('aria-pressed', String(b.getAttribute('data-path') === state.path)); });
            } };
          } else if (it[2] === 'len'){                                // Length: one slider, remembered separately for each path
            row.innerHTML = '<span class="wth-lcell"><label for="' + id + '">' + it[1] + '</label>' + clearBtn + '</span>' +
              '<input id="' + id + '" type="range" min="0.5" max="2.5" step="0.01"><output for="' + id + '"></output>';
            (function(row){
              var input = row.querySelector('input'), out = row.querySelector('output');
              input.addEventListener('input', function(){ out.value = (+input.value).toFixed(2); setVal('len_' + state.path, +input.value); });
              rows.length = { row: row, clear: row.querySelector('.wth-clear'), key: function(){ return 'len_' + state.path; }, sync: function(){
                var v = state['len_' + state.path] || 1; input.value = v; out.value = (+v).toFixed(2);
                input.title = 'Length of the ' + state.path + ' path';
              } };
            })(row);
          } else if (it[2] === 'unit'){                               // X / Y with a unit picker
            var axis = k, uk = k + 'Unit';
            row.className = 'wth-row wth-unitrow';
            row.innerHTML = '<span class="wth-lcell"><label for="' + id + '">' + it[1] + '</label>' + clearBtn + '</span>' +
              '<input id="' + id + '" type="range"><output for="' + id + '"></output>' +
              '<select aria-label="' + it[1] + ' unit" title="% is a share of the hero\'s size">' + UNITS[axis].map(function(u){ return '<option value="' + u[0] + '">' + u[1] + '</option>'; }).join('') + '</select>';
            (function(k, axis, uk, row){
              var input = row.querySelector('input'), out = row.querySelector('output'), sel = row.querySelector('select');
              var cssPer = function(unit){                              // CSS px per one unit
                if (!svhCss) measureSvh();
                if (unit === 'hero') return axis === 'x' ? el.clientWidth : el.clientHeight;
                if (unit === 'vw') return innerWidth/100;
                if (unit === 'vh') return innerHeight/100;
                if (unit === 'svh') return svhCss/100;
                return 1;
              };
              var key = function(){ return k + '_' + state.path; };       // remembered separately for each shape
              input.addEventListener('input', function(){ out.value = fmtUnit(+input.value, state[uk]); setVal(key(), +input.value); });
              sel.addEventListener('change', function(){
                // convert every shape's offset so each stays where it is (the unit is shared)
                var from = state[uk], to = sel.value, r = UNIT_RANGE[to];
                PATH_NAMES.forEach(function(p){
                  var pk = k + '_' + p[0], v = state[pk] * cssPer(from) / cssPer(to);
                  layers[bp][pk] = Math.max(r[0], Math.min(r[1], Math.round(v / r[2]) * r[2]));
                });
                layers[bp][uk] = to; refresh();
              });
              rows[k] = { row: row, clear: row.querySelector('.wth-clear'), key: key, unitKey: uk, sync: function(){
                var unit = state[uk], r = UNIT_RANGE[unit] || UNIT_RANGE.hero, v = state[key()];
                input.min = r[0]; input.max = r[1]; input.step = r[2]; input.value = v;
                out.value = fmtUnit(v, unit); sel.value = unit; input.title = 'For the ' + state.path + ' shape';
              } };
            })(k, axis, uk, row);
          } else {
            var isColor = it[2] === 'color';
            if (it[6]) row.setAttribute('data-threads-only', '');
            row.innerHTML = '<span class="wth-lcell"><label for="' + id + '">' + it[1] + '</label>' + clearBtn + '</span>' + (isColor
              ? '<input id="' + id + '" type="color" value="' + state[k] + '"><span></span>'
              : '<input id="' + id + '" type="range" min="' + it[2] + '" max="' + it[3] + '" step="' + it[4] + '" value="' + state[k] + '"><output for="' + id + '">' + fmt(state[k], it[5]) + '</output>');
            var input = row.querySelector('input'), out = row.querySelector('output');
            rows[k] = { row: row, clear: row.querySelector('.wth-clear'), input: input, out: out, dp: it[5] };
            if (CAMERA.indexOf(k) >= 0) (function(k, r){                // camera: remembered separately for each shape
              r.key = function(){ return k + '_' + state.path; };
              r.sync = function(){ var v = state[r.key()]; r.input.value = v; r.out.value = fmt(v, r.dp); r.input.title = 'For the ' + state.path + ' shape'; };
            })(k, rows[k]);
            (function(k, input, out, dp, isColor){
              input.addEventListener('input', function(){
                var v = isColor ? input.value : +input.value;
                if (out) out.value = fmt(v, dp);
                setVal(rows[k].key ? rows[k].key() : k, v);
              });
            })(k, input, out, it[5], isColor);
          }
          rows[k].clear.addEventListener('click', function(){ clearVal(rows[k].key ? rows[k].key() : k); });
          grp.appendChild(row);
        });
        if (g.name === 'Performance'){
          perfOut = document.createElement('p'); perfOut.className = 'wth-perf'; perfOut.setAttribute('role', 'status');
          perfOut.textContent = 'Measuring…'; grp.appendChild(perfOut);
        }
        body.appendChild(grp);
      });
      panelUi.syncAll();

      var segBtns = panel.querySelectorAll('[data-mode]');
      function setMode(m){
        if (m === 'threads' && !threads) return;
        if (m === 'photo' && !fallback) return;
        mode = m;
        segBtns.forEach(function(b){ b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === m)); });
        body.querySelectorAll('.wth-group').forEach(function(d){ d.hidden = m === 'photo' ? !(d.hasAttribute('data-both') || d.hasAttribute('data-photo')) : d.hasAttribute('data-photo'); });
        body.querySelectorAll('[data-threads-only]').forEach(function(r){ r.hidden = m === 'photo'; });
        cThreads.hidden = m !== 'threads'; cSwirl.hidden = m !== 'photo';
        if (m === 'photo') startSwirl();
        api.pause(paused);
      }
      segBtns.forEach(function(b){
        var m = b.getAttribute('data-mode');
        if ((m === 'threads' && !threads) || (m === 'photo' && !fallback)){
          b.disabled = true; b.title = m === 'photo' ? 'Add data-woven-fallback with the image URL to enable' : 'WebGL2 is not available in this browser';
        }
        b.addEventListener('click', function(){ setMode(m); });
      });
      setMode(mode);

      panel.querySelector('[data-act="pause"]').addEventListener('click', function(e){
        api.pause(!paused); e.currentTarget.textContent = paused ? 'Play' : 'Pause';
      });
      panel.querySelector('[data-act="reset"]').addEventListener('click', function(){
        layers = copyObj(savedLayers); refresh();
        note.textContent = 'Back to the settings saved on this element (all breakpoints).';
      });
      panel.querySelector('[data-act="copy"]').addEventListener('click', function(){
        var out = {};
        Object.keys(layers.desktop).forEach(function(k){ if (layers.desktop[k] !== DEFAULTS[k]) out[k] = round(layers.desktop[k]); });
        BPS.slice(1).forEach(function(b){
          var keys = Object.keys(layers[b.id]);
          if (keys.length){ out[b.id] = {}; keys.forEach(function(k){ out[b.id][k] = round(layers[b.id][k]); }); }
        });
        var text = JSON.stringify(out);
        var done = function(){ note.textContent = 'Copied (all breakpoints). Paste it as the value of data-woven-settings.'; };
        var manual = function(){
          note.innerHTML = 'Copy was blocked. Select this and paste it as the value of data-woven-settings:<textarea readonly></textarea>';
          var ta = note.querySelector('textarea'); ta.value = text; ta.focus(); ta.select();
        };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, manual);
        else manual();
      });
      btn.addEventListener('click', function(){
        panel.hidden = !panel.hidden;
        btn.setAttribute('aria-expanded', String(!panel.hidden));
        btn.textContent = panel.hidden ? 'Tune hero' : 'Close';
        clampPos();
      });
      /* ----- placement: docked inside [data-woven-panel], or a floating window you can drag -----
         Where it floats, whether it's minimised and whether it's popped out are remembered per browser. */
      var host = document.querySelector('[data-woven-panel]');
      var floatBtn = panel.querySelector('[data-act="float"]'), minBtn = panel.querySelector('[data-act="min"]');
      var bar = panel.querySelector('.wth-titlebar');
      var prefs = {};
      try { prefs = JSON.parse(localStorage.getItem('wth-panel') || '{}'); } catch (e) {}
      function savePrefs(){ try { localStorage.setItem('wth-panel', JSON.stringify(prefs)); } catch (e) {} }
      function clampPos(){
        if (!panel.classList.contains('wth-float')) return;
        var r = panel.getBoundingClientRect();
        var l = Math.max(8, Math.min(innerWidth - r.width - 8, r.left)), t = Math.max(8, Math.min(innerHeight - 44, r.top));
        panel.style.left = l + 'px'; panel.style.top = t + 'px';
        panel.style.maxHeight = Math.max(44, innerHeight - t - 8) + 'px';      // never runs off the bottom; the body scrolls
      }
      function setFloating(on){
        if (on){
          panel.classList.remove('wth-inline'); panel.classList.add('wth-float');
          if (panel.parentNode !== document.body) document.body.appendChild(panel);
          var w = Math.min(340, innerWidth - 16);
          panel.style.left = (prefs.left != null ? prefs.left : innerWidth - w - 16) + 'px';
          panel.style.top = (prefs.top != null ? prefs.top : 16) + 'px';
          panel.style.right = 'auto'; panel.style.bottom = 'auto';
          panel.hidden = false;
          clampPos();
        } else if (host){
          panel.classList.remove('wth-float'); panel.classList.add('wth-inline');
          panel.style.left = panel.style.top = panel.style.right = panel.style.bottom = panel.style.maxHeight = '';
          host.appendChild(panel); panel.hidden = false;
        }
        floatBtn.textContent = on ? 'Dock' : 'Pop out';
        floatBtn.hidden = !host;                                   // nowhere to dock without a host element
        btn.hidden = !!host || on;                                  // the Tune button only matters with no host
        prefs.floating = on; savePrefs();
      }
      function setMin(on){
        panel.classList.toggle('wth-min', on);
        minBtn.textContent = on ? '+' : '–';
        minBtn.setAttribute('aria-label', on ? 'Expand' : 'Minimise');
        minBtn.setAttribute('aria-expanded', String(!on));
        prefs.min = on; savePrefs();
        clampPos();
      }
      floatBtn.addEventListener('click', function(){ setFloating(!panel.classList.contains('wth-float')); });
      minBtn.addEventListener('click', function(){ setMin(!panel.classList.contains('wth-min')); });

      // drag by the title bar while floating
      var drag = null;
      bar.addEventListener('pointerdown', function(e){
        if (!panel.classList.contains('wth-float') || e.target.closest('button')) return;
        var r = panel.getBoundingClientRect();
        drag = { x: e.clientX, y: e.clientY, l: r.left, t: r.top };
        bar.setPointerCapture(e.pointerId); e.preventDefault();
      });
      bar.addEventListener('pointermove', function(e){
        if (!drag) return;
        panel.style.left = (drag.l + e.clientX - drag.x) + 'px';
        panel.style.top = (drag.t + e.clientY - drag.y) + 'px';
        clampPos();
      });
      function endDrag(){
        if (!drag) return; drag = null;
        var r = panel.getBoundingClientRect(); prefs.left = Math.round(r.left); prefs.top = Math.round(r.top); savePrefs();
      }
      bar.addEventListener('pointerup', endDrag); bar.addEventListener('pointercancel', endDrag);
      window.addEventListener('resize', clampPos, { passive: true });

      document.body.appendChild(btn);
      if (host && !prefs.floating){ setFloating(false); }
      else if (host){ setFloating(true); }
      else {                                                        // no host: floating, opened by the Tune button
        panel.classList.add('wth-float'); document.body.appendChild(panel);
        floatBtn.hidden = true; panel.hidden = true;
        if (prefs.left != null){ panel.style.left = prefs.left + 'px'; panel.style.top = prefs.top + 'px'; panel.style.right = panel.style.bottom = 'auto'; }
      }
      if (prefs.min) setMin(true);
    }
    });
  }

  function boot(){ document.querySelectorAll('[data-woven-hero]').forEach(init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.WovenThreadHero = { init: init, defaults: DEFAULTS, version: '1.6.0' };
})();
