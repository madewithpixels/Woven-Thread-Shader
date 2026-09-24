/* ============================================================
   Woven Thread Hero — Webflow boot + toggleable settings panel
   ------------------------------------------------------------
   On the hero element in Webflow, add custom attributes:

     data-woven-hero                 (required, no value)
     data-woven-settings  = {...}    (optional JSON from the panel's Copy button)
     data-woven-fallback  = <url>    (optional: the swirl image asset URL, used for
                                      the lo-fi photo version and as a still fallback)
     data-woven-controls             (optional: shows the Tune button + panel)

   The panel can also be opened on any page by adding ?tune to the URL.
   ============================================================ */
(function(){
  var DEFAULTS = {
    speed: 1, flow: 1.9, twist: 3, shimmer: 1.05, parallax: 1.45,
    fan: 1.24, hole: 1.09,
    threads: 1500, mobileThreads: 1000, thickness: 1.55, highlights: 1, opacity: 1.01, warmth: 0.6, accents: 2.2,
    targetFps: 60,
    hue: 0, saturation: 0.83, brightness: 1, paper: '#efe1dc',
    zoom: 0.91, shiftX: 0, focalY: 0.36, widthShare: 0.54
  };

  var GROUPS = [
    { name: 'Motion', both: true, items: [
      ['speed', 'Speed', 0, 2, 0.05], ['flow', 'Flow', 0, 3, 0.05], ['twist', 'Twist', 0, 5, 0.05],
      ['shimmer', 'Shimmer', 0, 2, 0.05], ['parallax', 'Mouse tilt', 0, 3, 0.05, null, true] ]},
    { name: 'Shape', items: [ ['fan', 'Fan size', 0.7, 1.5, 0.01], ['hole', 'Hole size', 0.6, 1.4, 0.01] ]},
    { name: 'Threads', items: [
      ['threads', 'Count', 400, 4000, 100, 0], ['mobileThreads', 'On phones', 400, 3000, 100, 0],
      ['thickness', 'Thickness', 0.4, 3, 0.05], ['highlights', 'Highlights', 0, 4, 0.1],
      ['opacity', 'Opacity', 0.3, 1.6, 0.01], ['warmth', 'Warmth', 0, 1, 0.01], ['accents', 'Accents', 0, 3, 0.05] ]},
    { name: 'Colour', items: [
      ['hue', 'Hue shift', -180, 180, 1, 0], ['saturation', 'Saturation', 0, 1.6, 0.01],
      ['brightness', 'Brightness', 0.6, 1.3, 0.01], ['paper', 'Paper', 'color'] ]},
    { name: 'Performance', items: [ ['targetFps', 'Target fps', 0, 60, 5, 'fps'] ]},
    { name: 'Framing', both: true, items: [
      ['zoom', 'Zoom', 0.6, 1.6, 0.01, 2, true], ['shiftX', 'Shift x', -0.4, 0.4, 0.01, 2, true],
      ['focalY', 'Shift y', 0, 1, 0.01], ['widthShare', 'Art width', 0.3, 1, 0.01] ]}
  ];
  var SWIRL_KEYS = ['speed', 'flow', 'twist', 'shimmer', 'focalY', 'widthShare'];

  var CSS = '\
.wth-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;z-index:-1;pointer-events:none}\
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

  function init(el){
    if (el.__woven) return;
    var saved = {};
    try { saved = JSON.parse(el.getAttribute('data-woven-settings') || '{}'); }
    catch (e) { console.warn('[woven] data-woven-settings is not valid JSON', e); }
    var state = Object.assign({}, DEFAULTS, saved);
    var fallback = el.getAttribute('data-woven-fallback');
    var ctrlAttr = el.getAttribute('data-woven-controls');
    var showControls = (ctrlAttr !== null && ctrlAttr !== 'false') || /[?&]tune(=|&|$)/.test(location.search);
    var narrow = function(){ return window.matchMedia('(max-width: 760px)').matches; };

    injectCSS();
    // the canvases sit behind the hero's own content without touching its children
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    el.style.isolation = 'isolate';
    if (fallback && !el.style.backgroundImage){
      el.style.backgroundImage = 'url("' + fallback + '")';
      el.style.backgroundRepeat = 'no-repeat';
      el.style.backgroundPosition = 'right ' + Math.round(state.focalY * 100) + '%';
      el.style.backgroundSize = narrow() ? 'cover' : 'auto 100%';
    }
    var cThreads = document.createElement('canvas'), cSwirl = document.createElement('canvas');
    cThreads.className = cSwirl.className = 'wth-canvas';
    cThreads.setAttribute('aria-hidden', 'true'); cSwirl.setAttribute('aria-hidden', 'true');
    cSwirl.hidden = true;
    el.insertBefore(cSwirl, el.firstChild); el.insertBefore(cThreads, el.firstChild);

    function threadOpts(){
      var o = Object.assign({ maxDpr: 1.5, onPerf: function(p){ if (perfOut) perfOut.textContent = p.fps + ' fps · ' + (p.level ? 'quality stepped down ' + p.level + ' of ' + p.levels : 'full quality'); } }, state);
      o.threads = narrow() ? Math.min(state.mobileThreads, state.threads) : state.threads;
      return o;
    }
    var threads = null, perfOut = null;
    try { threads = mwpThreads(cThreads, threadOpts()); } catch (e) { console.warn('[woven]', e); }
    var swirl = null, mode = threads ? 'threads' : 'photo', paused = false;

    function startSwirl(){
      if (swirl || !fallback) return;
      var o = { src: fallback }; SWIRL_KEYS.forEach(function(k){ o[k] = state[k]; });
      try { swirl = mwpSwirl(cSwirl, o); } catch (e) { console.warn('[woven]', e); }
    }
    if (threads) el.style.backgroundImage = 'none';
    else if (fallback){ cThreads.hidden = true; cSwirl.hidden = false; startSwirl(); }

    function apply(v){
      if (threads){
        var t = Object.assign({}, v);
        if ('threads' in v || 'mobileThreads' in v) t.threads = threadOpts().threads;
        delete t.mobileThreads; threads.set(t);
      }
      if (swirl){
        var s = {}; SWIRL_KEYS.forEach(function(k){ if (k in v) s[k] = v[k]; }); swirl.set(s);
      }
    }
    var api = {
      set: function(v){ Object.assign(state, v); apply(v); },
      get: function(){ return Object.assign({}, state); },
      pause: function(p){ paused = !!p; threads && threads.pause(paused || mode !== 'threads'); swirl && swirl.pause(paused || mode !== 'photo'); }
    };
    el.__woven = api;
    if (showControls) buildPanel();

    function buildPanel(){
      var btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'wth-toggle'; btn.textContent = 'Tune hero';
      btn.setAttribute('aria-expanded', 'false');
      var panel = document.createElement('aside');
      panel.className = 'wth-panel'; panel.hidden = true; panel.setAttribute('aria-label', 'Hero settings');
      panel.innerHTML =
        '<div class="wth-head"><div class="wth-seg" role="group" aria-label="Renderer">' +
        '<button type="button" data-mode="threads">Threads</button><button type="button" data-mode="photo">Photo (lo-fi)</button>' +
        '</div></div><div class="wth-body"></div>' +
        '<div class="wth-foot"><button type="button" data-act="pause">Pause</button><button type="button" data-act="reset">Reset</button>' +
        '<button type="button" data-act="copy" class="wth-primary">Copy</button></div><p class="wth-note" role="status"></p>';
      var body = panel.querySelector('.wth-body'), note = panel.querySelector('.wth-note');
      var inputs = {};
      GROUPS.forEach(function(g){
        var grp = document.createElement('div');
        grp.className = 'wth-group'; if (g.both) grp.setAttribute('data-both', '');
        grp.innerHTML = '<h3>' + g.name + '</h3>';
        g.items.forEach(function(it){
          var k = it[0], id = 'wth-' + k, row = document.createElement('div');
          row.className = 'wth-row';
          var isColor = it[2] === 'color';
          if (it[6]) row.setAttribute('data-threads-only', '');
          row.innerHTML = '<label for="' + id + '">' + it[1] + '</label>' + (isColor
            ? '<input id="' + id + '" type="color" value="' + state[k] + '"><span></span>'
            : '<input id="' + id + '" type="range" min="' + it[2] + '" max="' + it[3] + '" step="' + it[4] + '" value="' + state[k] + '"><output for="' + id + '">' + fmt(state[k], it[5]) + '</output>');
          var input = row.querySelector('input'), out = row.querySelector('output');
          inputs[k] = { input: input, out: out, dp: it[5] };
          input.addEventListener('input', function(){
            var v = isColor ? input.value : +input.value;
            state[k] = v; if (out) out.value = fmt(v, it[5]);
            var o = {}; o[k] = v; apply(o);
          });
          grp.appendChild(row);
        });
        if (g.name === 'Performance'){
          perfOut = document.createElement('p'); perfOut.className = 'wth-perf'; perfOut.setAttribute('role', 'status');
          perfOut.textContent = 'Measuring…'; grp.appendChild(perfOut);
        }
        body.appendChild(grp);
      });

      var segBtns = panel.querySelectorAll('[data-mode]');
      function setMode(m){
        if (m === 'threads' && !threads) return;
        if (m === 'photo' && !fallback) return;
        mode = m;
        segBtns.forEach(function(b){ b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === m)); });
        body.querySelectorAll('.wth-group').forEach(function(d){ d.hidden = m === 'photo' && !d.hasAttribute('data-both'); });
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
        Object.assign(state, DEFAULTS, saved);
        Object.keys(inputs).forEach(function(k){
          var r = inputs[k]; r.input.value = state[k]; if (r.out) r.out.value = fmt(state[k], r.dp);
        });
        apply(state); note.textContent = 'Back to the settings saved on this element.';
      });
      panel.querySelector('[data-act="copy"]').addEventListener('click', function(){
        var diff = {};
        Object.keys(state).forEach(function(k){
          if (state[k] !== DEFAULTS[k]) diff[k] = typeof state[k] === 'number' ? +state[k].toFixed(3) : state[k];
        });
        var text = JSON.stringify(diff);
        var done = function(){ note.textContent = 'Copied. Paste it as the value of data-woven-settings.'; };
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
      });
      document.body.appendChild(panel); document.body.appendChild(btn);
    }
  }

  function boot(){ document.querySelectorAll('[data-woven-hero]').forEach(init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.WovenThreadHero = { init: init, defaults: DEFAULTS };
})();
