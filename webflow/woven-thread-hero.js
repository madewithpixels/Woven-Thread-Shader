/*! Woven Thread Hero · madewithpixels · WebGL threads + lo-fi photo fallback */
(function(){
'use strict';
function mwpSwirl(canvas, opts){
  const o = Object.assign({
    src: 'swirl.jpg',
    centre: [0.787, 0.215],   // hole of the ring, as fraction of image
    focalY: 0.36,             // vertical point kept in view when cropping
    widthShare: 0.54,         // share of a landscape hero the artwork spans
    speed: 1, flow: 1, twist: 1, shimmer: 1,
    maxDpr: 1.75
  }, opts || {});

  const gl = canvas.getContext('webgl', {antialias:false, premultipliedAlpha:false, alpha:false})
          || canvas.getContext('experimental-webgl');
  if (!gl) return null;                     // CSS background image remains as fallback

  const vs = `attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`;
  const fs = `
precision highp float;
uniform sampler2D uTex;
uniform vec2 uRes, uImg, uOffset, uCentre, uMouse;
uniform float uScale, uTime, uFlow, uTwist, uShimmer;

float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){
  vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y);
}
float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<4;i++){ v+=a*noise(p); p=p*2.03+vec2(1.7,9.2); a*=.5; } return v; }

vec3 hueShift(vec3 c, float h){               // rotate hue in YIQ space
  const mat3 toYIQ=mat3(.299,.596,.211,.587,-.274,-.523,.114,-.322,.312);
  const mat3 toRGB=mat3(1.,1.,1.,.956,-.272,-1.106,.621,-.647,1.703);
  vec3 yiq=toYIQ*c; float s=sin(h), co=cos(h);
  yiq.yz=mat2(co,s,-s,co)*yiq.yz; return toRGB*yiq;
}

vec3 sampleArt(vec2 uv){
  // left of the artwork: mirror-tile the plain paper strip so grain continues
  if(uv.x < 0.0){ float x = mod(-uv.x, 0.16); uv.x = x > 0.08 ? 0.16 - x : x; }
  return texture2D(uTex, clamp(uv, vec2(0.001), vec2(0.999))).rgb;
}

void main(){
  vec2 p  = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 ip = (p - uOffset) / uScale + uMouse * 7.0;       // image pixels, gentle parallax
  vec2 c  = uCentre * uImg;
  vec2 d  = ip - c;
  float r = length(d) / uImg.y;
  float t = uTime;

  // 1. slow twist about the ring's hole, strongest near the ring
  float tw = uTwist * 0.02 * sin(t*0.31 - r*4.5) * exp(-r*2.0);
  float cs = cos(tw), sn = sin(tw);
  vec2 q = c + vec2(cs*d.x - sn*d.y, sn*d.x + cs*d.y);

  // 2. breathing: a whisper of scale about the centre
  q = c + (q - c) * (1.0 + 0.005*uTwist*sin(t*0.21));

  // 3. low-frequency flow field, like silk in slow water
  vec2 np = q / uImg.y * 2.4;
  vec2 w = vec2(fbm(np + vec2(t*0.045, -t*0.035)),
                fbm(np + vec2(5.2,1.3) + vec2(-t*0.04, t*0.05))) - 0.5;
  q += w * uFlow * 16.0;

  vec2 uv = q / uImg;
  vec3 col = sampleArt(uv);

  // thread mask: how far this pixel is from bare paper
  float m = smoothstep(0.035, 0.22, distance(col, vec3(0.93,0.87,0.85)));

  // 4. travelling glints and a faint iridescent drift along the threads
  float a  = atan(d.y, d.x);
  float ph = a*1.0 + r*13.0 - t*0.55 + fbm(np*1.6)*3.0;
  float band = 0.5 + 0.5*sin(ph);
  float glint = pow(band, 22.0);
  float sheen = pow(band, 3.0);
  col = hueShift(col, m * uShimmer * 0.09 * sin(a*2.0 + r*6.0 + t*0.27));
  col += m * uShimmer * (glint*0.13 + sheen*0.03) * vec3(1.0, 0.96, 0.9);

  gl_FragColor = vec4(clamp(col,0.,1.), 1.0);
}`;

  function sh(type, src){ const s=gl.createShader(type); gl.shaderSource(s,src); gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog); gl.useProgram(prog);

  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog,'p'); gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const U = {}; ['uTex','uRes','uImg','uOffset','uCentre','uMouse','uScale','uTime','uFlow','uTwist','uShimmer']
    .forEach(n => U[n] = gl.getUniformLocation(prog, n));

  const tex = gl.createTexture();
  let img = null, ready = false, running = true, visible = true;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let t = 0, last = 0, raf = 0;
  const mouse = {x:0,y:0,tx:0,ty:0};

  function layout(){
    const dpr = Math.min(window.devicePixelRatio || 1, o.maxDpr);
    const W = Math.round(canvas.clientWidth * dpr), H = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== W || canvas.height !== H){ canvas.width = W; canvas.height = H; }
    gl.viewport(0,0,W,H);
    if (!img) return;
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const share = W / H > 1.1 ? o.widthShare : 1.0;
    const s = Math.max(H / ih, share * W / iw);
    const offX = W - iw * s;
    let offY = H * 0.5 - o.focalY * ih * s;
    offY = Math.min(0, Math.max(H - ih * s, offY));
    gl.uniform2f(U.uRes, W, H);
    gl.uniform2f(U.uImg, iw, ih);
    gl.uniform2f(U.uOffset, offX, offY);
    gl.uniform1f(U.uScale, s);
  }

  function draw(){
    gl.uniform1f(U.uTime, t);
    gl.uniform2f(U.uMouse, mouse.x, mouse.y);
    gl.uniform1f(U.uFlow, o.flow);
    gl.uniform1f(U.uTwist, o.twist);
    gl.uniform1f(U.uShimmer, o.shimmer);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function frame(now){
    raf = 0;
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0; last = now;
    t += dt * o.speed;
    mouse.x += (mouse.tx - mouse.x) * 0.03; mouse.y += (mouse.ty - mouse.y) * 0.03;
    draw();
    loop();
  }
  function loop(){
    if (ready && running && visible && !reduce.matches && !raf) raf = requestAnimationFrame(frame);
    else if (!raf) last = 0;
  }
  function still(){ if (ready){ layout(); draw(); } }

  img = new Image();
  img.crossOrigin = 'anonymous';
  canvas.style.visibility = 'hidden';                 // no black frame before the image arrives
  img.onerror = () => { canvas.hidden = true; };      // CSS background image stays as the fallback
  img.onload = () => {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
    gl.uniform1i(U.uTex, 0);
    gl.uniform2f(U.uCentre, o.centre[0], o.centre[1]);
    ready = true; canvas.style.visibility = ''; still(); loop();
  };
  img.src = o.src;

  new ResizeObserver(still).observe(canvas);
  new IntersectionObserver(e => { visible = e[0].isIntersecting; loop(); }).observe(canvas);
  reduce.addEventListener?.('change', () => { still(); loop(); });
  addEventListener('pointermove', e => {
    const r = canvas.getBoundingClientRect();
    mouse.tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    mouse.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
  }, {passive:true});

  return {
    set(v){ Object.assign(o, v); if (!raf) still(); },
    pause(p){ running = !p; if (p) still(); loop(); }
  };
}

/* ============================================================
   Silk threads — procedural, WebGL2, no library.
   Every thread is a ribbon (an instanced triangle strip) whose shape,
   width and colour are computed in the vertex shader (no buffers).

   Paths (set with {path}): loop (the woven swirl), wave (a voiceprint),
   vortex (spiralling to a calm centre), braid (three bundles weaving),
   bloom (gathering at a throat, then opening out). Changing path
   morphs between them; blend(a, b, m) sets a morph directly.

   mwpThreads(canvas, opts) returns { set, get, pause, blend, quality }
   ============================================================ */
function mwpThreads(canvas, opts){
  const o = Object.assign({
    threads: 1500,          // number of threads
    segments: 180,          // points per half-loop (quality ladder scales this)
    thickness: 1.55,        // strand width in CSS pixels
    highlights: 1,          // amount of thicker white strands
    targetFps: 60,          // adaptive quality: 0 = off
    maxFps: 30,             // frame cap: the motion is slow, so 30 looks the same at half the GPU work. 0 = uncapped
    onPerf: null,           // callback({fps, level, levels, threads, points, scale, width, height, gpu}) about once a second
    path: 'loop',           // loop · wave · vortex · braid · bloom
    morphTime: 1.8,         // seconds to morph when the path changes
    focalY: 0.36, widthShare: 0.54,
    art: [1400, 2304],      // artwork frame in px (matches the photo so layouts line up)
    speed: 1, flow: 1.9, twist: 3, shimmer: 1.05, parallax: 1.45,   // motion
    fan: 1.24, hole: 1.4,                                    // shape
    opacity: 1.01, warmth: 0.6, accents: 2.2,                // threads
    hue: 0, saturation: 0.83, brightness: 1,                 // colour
    paper: '#efe1dc',                                        // background
    x: 0, y: 0, zoom: 0.91,                                  // position: x/y as a share of the viewport, zoom about the shape's centre
    turn: 0, tilt: 0, rotate: 0,                             // 3D rotation in degrees
    depth: 0.6, fog: 0.6,                                    // perspective strength, and how far strands fade into the paper
    maxDpr: 2
  }, opts || {});

  // no MSAA: strands draw their own soft edges, which is much cheaper
  const gl = canvas.getContext('webgl2', {antialias:false, alpha:false, premultipliedAlpha:true});
  if (!gl) return null;

  /* ---------- background: paper ---------- */
  const bgVS = `#version 300 es
  void main(){ vec2 p = vec2((gl_VertexID<<1)&2, gl_VertexID&2); gl_Position = vec4(p*2.-1.,0.,1.); }`;
  const bgFS = `#version 300 es
  precision highp float;
  uniform vec2 uRes; uniform vec3 uPaper; out vec4 frag;
  float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
  float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
    return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
  void main(){
    vec2 p = gl_FragCoord.xy;
    float g = n(p*0.9)*0.5 + n(p*0.35)*0.35 + n(p*0.08)*0.15;     // cold-press paper tooth
    vec3 paper = uPaper;
    paper *= 0.985 + g*0.03;
    float v = length((p/uRes - 0.5)*vec2(1.0,0.8));
    paper *= 1.0 - v*v*0.05;
    frag = vec4(paper, 1.0);
  }`;

  /* ---------- threads ----------
     Every path is a family of 3D curves in "art units" (1 = artwork height, y down, z toward the
     viewer), centred on the pivot. A thread is drawn in two halves (back half first, so the loop's
     inner wall sits behind its front), and each end carries a straight tail that runs well past the
     screen edge, so no thread visibly starts or stops. Paths morph by blending positions. */
  const PATHS = ['loop', 'wave', 'vortex', 'braid', 'bloom'];
  const thVS = (sa, sb, morph) => `#version 300 es
  precision highp float;
  // each path (and each morph pair) gets its own compiled program, so a vertex only runs the maths it needs
  #define SA ${sa}
  #define SB ${sb}
  #define MORPH ${morph ? 1 : 0}
  uniform int uSeg, uHalf, uInstBase, uIsHl, uTailPts;
  uniform float uTime, uFlow, uTwist, uShimmer, uMorph;
  uniform vec2 uRes, uMouse, uPivot, uPivotPx;
  uniform vec3 uRot, uPaperC;
  uniform float uPxScale, uDepth, uFog, uTail;
  uniform float uFan, uHole, uOpacity, uWarm, uAccent, uHue, uSat, uBright, uThick, uDpr;
  out vec4 vCol;
  out float vAcross, vHalf, vHl;

  const float PI = 3.14159265, TAU = 6.2831853, EXT = 0.3*PI;
  vec3 hueShift(vec3 c, float h){
    const mat3 toYIQ=mat3(.299,.596,.211,.587,-.274,-.523,.114,-.322,.312);
    const mat3 toRGB=mat3(1.,1.,1.,.956,-.272,-1.106,.621,-.647,1.703);
    vec3 yiq=toYIQ*c; float s=sin(h), co=cos(h);
    yiq.yz=mat2(co,s,-s,co)*yiq.yz; return toRGB*yiq;
  }
  float h1(float n){ return fract(sin(n*127.1 + 3.7)*43758.5453); }

  // per-thread randoms, shared by every function below
  float r1, r2, r3, r4, r5, r6, r8;

  /* ================= LOOP: the woven swirl from the photo ================= */
  float loopPhi(float tb){ return tb < 0.5 ? mix(-EXT, PI, tb*2.0) : mix(PI, TAU + EXT, (tb - 0.5)*2.0); }

  vec3 loopPos(float tb, float t){
    float phi  = loopPhi(tb);
    float phiF = phi < 0.0 ? TAU - phi : phi;          // before the crossing, a thread arrives the way it leaves
    float oF = pow(r1, 2.1), oB = pow(r1, 1.25);
    vec2  cc = vec2(0.550, 0.000);
    vec2  R  = vec2(0.400, 0.335) * (1.0 + (r2-.5)*.03);
    float th0 = 2.779 + phi;
    float breathe = 1.0 + 0.012*uTwist*sin(t*0.23);
    vec3  C  = vec3(cc + R*breathe*vec2(cos(th0), sin(th0)), sin(th0)*0.22);
    float backW = phi < 0.0 ? 0.0 : 1.0 - smoothstep(0.85*PI, 1.15*PI, phi);
    float o = mix(oF, oB, backW);

    // FRONT: ellipses that all pass through the pinch
    float of = oF * (1.0 + 0.035*uTwist*sin(t*0.21 + r3*6.28));
    vec2  pin0 = cc + R*vec2(cos(2.779), sin(2.779));
    vec2  fc = mix(cc, pin0 + (vec2(0.550, 0.455) - pin0)*uFan, of) + vec2(0.006, 0.01)*uTwist*sin(t*0.17 + of*3.0);
    vec2  fR = mix(R, vec2(0.485, 0.535)*uFan, of) * (1.0 + 0.01*uTwist*sin(t*0.23 + 2.0));
    float fp = mix(2.779, 3.835, of);
    float fa = fp + phiF;
    vec3 Pf = vec3(fc + fR*vec2(cos(fa), sin(fa)), sin(fa)*0.22*(1.0 + of));
    vec2 miss = pin0 - (fc + fR*vec2(cos(fp), sin(fp)));
    Pf.xy += miss * smoothstep(1.35*PI, 2.0*PI, phiF);
    Pf.z  += 0.22*sin(2.779) - 0.22*(1.0 + of)*sin(fp);
    Pf.y  -= (1.0 - of) * (0.010*smoothstep(1.3*PI, 1.6*PI, phiF) + 0.022*smoothstep(1.55*PI, 1.8*PI, phiF)*(1.0 - smoothstep(1.86*PI, 2.0*PI, phiF)));

    // BACK: the inside wall of the funnel
    vec2  hc = vec2(0.522, 0.188), hr = vec2(0.160, 0.150) * uHole * (1.0 + 0.02*uTwist*sin(t*0.23 + 1.0));
    float psi = 0.52*PI + 1.58*PI*pow(clamp(phi/PI, 0., 1.), 1.25) + 0.03*uTwist*sin(t*0.17);
    vec3  I   = vec3(hc + hr*vec2(cos(psi), sin(psi)) + vec2(0., 0.012), -0.12);
    float open = smoothstep(0.0, 0.10*PI, phi);
    float ob = oB * open * (1.0 + 0.04*sin(t*0.31 + r4*6.28));
    vec3 Pb = mix(C, I, ob);
    Pb.xy += vec2(-0.015, 0.05) * sin(ob*PI) * (1.0 - smoothstep(0.2*PI, 0.5*PI, phi)*.6);

    vec3 P = mix(Pf, Pb, backW);
    float amp = uFlow * (0.0025 + 0.009*o);
    float waist = 1.0 - exp(-pow((phiF - TAU)/(0.22*PI), 2.0));
    waist *= mix(1.0, smoothstep(0.0, 0.2*PI, phi), backW);
    P.xy += waist * amp * vec2(sin(phiF*3.0 + t*0.42 + r3*6.28), cos(phiF*2.0 - t*0.35 + r4*6.28));
    return P;
  }

  // white strands fade out at the loop's crossing so it stays clean
  float hlFade(int s, float tb){
    if (s != 0) return 1.0;
    float phi = loopPhi(tb), phiC = phi < 0.0 ? TAU - phi : phi;
    float backW = phi < 0.0 ? 0.0 : 1.0 - smoothstep(0.85*PI, 1.15*PI, phi);
    return (1.0 - 0.75*exp(-pow((phiC - TAU)/(0.14*PI), 2.0))) * mix(1.0, smoothstep(0.1*PI, 0.3*PI, phi), backW);
  }
  vec4 loopCol(float tb, bool hl){
    float phi = loopPhi(tb), phiC = phi < 0.0 ? TAU - phi : phi;
    float oF = pow(r1, 2.1), oB = pow(r1, 1.25);
    float backW = phi < 0.0 ? 0.0 : 1.0 - smoothstep(0.85*PI, 1.15*PI, phi);
    float o = mix(oF, oB, backW);
    float x = phiC / PI;
    float backness = phi < 0.0 ? 0.0 : 1.0 - smoothstep(0.85, 1.25, x);
    float ow = o + (r3-.5)*.18;
    vec3 wall = mix(vec3(.50,.76,.62), vec3(.07,.50,.34), smoothstep(.05,.40,ow));
    wall = mix(wall, vec3(.02,.36,.42), smoothstep(.55,.85,ow));
    wall = mix(wall, vec3(.03,.22,.30), smoothstep(.85,1.0,ow)*.7);
    wall = mix(wall, vec3(.92,.78,.76), step(.93, r4)*.7);
    wall = mix(vec3(.18,.05,.22), wall, smoothstep(.02,.20,x));
    vec3 purple = mix(vec3(.20,.06,.24), vec3(.46,.20,.52), smoothstep(.0,.12,o));
    purple = mix(purple, vec3(.56,.26,.58), smoothstep(.12,.30,o));
    vec3 warm = mix(vec3(.72,.18,.16), vec3(.93,.52,.18), r3);
    vec3 pale = mix(vec3(.95,.84,.80), vec3(.55,.80,.66), smoothstep(.35,.75,r4)*(1.0-smoothstep(1.62,1.8,x)));
    vec3 fr = purple;
    fr = mix(fr, warm, smoothstep(.24,.36,o) * step(1.0 - uWarm, r5+o*.3));
    fr = mix(fr, pale, smoothstep(.40,.66,o+(r5-.5)*.25) * step(.12, r4));
    vec3 col = mix(fr, wall, backness);
    col *= mix(1.0, 0.72, smoothstep(TAU, TAU + 0.12*PI, phiC) * (1.0 - smoothstep(.3,.7,o)));
    float alpha = mix(0.72, 0.22, smoothstep(0., .8, o)*(1.0-backW*.6)) * (0.45 + 0.55*r5);
    alpha *= 1.0 - 0.45*smoothstep(.35,.8,o)*(1.0-backW);
    alpha *= 1.0 - 0.85*smoothstep(TAU, TAU + 0.08*PI, phiC)*smoothstep(.18, .5, o)*(1.0-backW);
    return vec4(col, alpha);
  }

  /* ================= shared palette for the other paths =================
     p: 0 teal · .18 green · .36 deep purple · .5 purple · .64 plum · .76 warm · .9 pale · 1 cream */
  vec3 palette(float p){
    vec3 warm = mix(vec3(.72,.18,.16), vec3(.93,.52,.18), r3);
    vec3 pale = mix(vec3(.95,.84,.80), vec3(.60,.82,.70), step(.6, r4));
    vec3 c = mix(vec3(.03,.36,.42), vec3(.07,.50,.34), smoothstep(.0,.18,p));
    c = mix(c, vec3(.20,.06,.24), smoothstep(.18,.36,p));
    c = mix(c, vec3(.46,.20,.52), smoothstep(.36,.50,p));
    c = mix(c, vec3(.58,.28,.58), smoothstep(.50,.64,p));
    c = mix(c, mix(vec3(.58,.28,.58), warm, step(1.0 - uWarm, r5)), smoothstep(.64,.76,p));
    c = mix(c, pale, smoothstep(.76,.90,p));
    c = mix(c, vec3(.97,.92,.87), smoothstep(.90,1.0,p));
    return c;
  }
  vec4 paletteCol(float p){
    p = clamp(p, 0., 1.);
    float alpha = mix(0.72, 0.26, smoothstep(.55, 1.0, p)) * (0.45 + 0.55*r5);
    return vec4(palette(p), alpha);
  }

  /* ================= WAVE: a voiceprint flowing across ================= */
  vec3 wavePos(float tb, float t){
    float x = mix(-1.1, 1.1, tb);                                   // relative to the pivot
    float env = exp(-pow((x + 0.05)/(0.42*uFan), 2.0));             // loudest at the centre
    float o = r1;
    float ph = x*7.0 - t*0.5 + o*0.8;
    float y = (o - 0.5)*(0.035 + 0.16*env)
            + env*0.085*sin(ph)*(0.7 + 0.3*sin(x*2.3 + t*0.2))*(0.4 + 0.2*uTwist)
            + 0.025*env*sin(x*19.0 + t*0.9 + r3*6.28)
            + uFlow*0.004*sin(x*11.0 + t*0.6 + r4*6.28);
    float z = (o - 0.5)*0.35*env + 0.14*env*cos(x*5.0 - t*0.4 + o*2.0);
    return vec3(uPivot + vec2(x, y*uHole), z);
  }
  vec4 waveCol(float tb){ float x = mix(-1.1, 1.1, tb); return paletteCol(r1*0.92 + x*0.06 + (r2-.5)*0.08); }

  /* ================= VORTEX: spiralling in to a calm centre and out ================= */
  vec3 vortexPos(float tb, float t){
    float c = 2.0*tb - 1.0;
    float rr = mix(0.09*uHole, 0.55*uFan, pow(abs(c), 1.3)) * (0.78 + 0.44*r1);
    rr += 1.6*pow(abs(c), 7.0);                                     // ends swing outward, so tails leave radially
    rr *= 1.0 + uFlow*0.02*sin(tb*19.0 + t*0.5 + r3*6.28);
    float th = -0.35*PI + r2*1.05*PI + c*1.35*PI + t*0.015*uTwist;   // arms arrive from one side, leaving the other quiet
    vec2 p = rr*vec2(cos(th), sin(th)*0.78);
    float z = c*0.55 + 0.12*sin(th);
    return vec3(uPivot + p, z);
  }
  vec4 vortexCol(float tb){
    float close = 1.0 - abs(2.0*tb - 1.0);
    float p = mix(0.92, 0.38, pow(close, 1.4)) + (r1 - .5)*0.22 - step(r2, 0.28)*0.32;
    vec4 c = paletteCol(p);
    c.a *= mix(0.3, 1.0, smoothstep(0.1, 0.75, close));          // outer arms recede, the centre carries the image
    return c;
  }

  /* ================= BRAID: three bundles weaving together ================= */
  vec3 braidPos(float tb, float t){
    float x = mix(-1.25, 1.25, tb);
    float b = floor(r8*3.0);
    float ph = x*5.0 - t*0.05*uTwist + b*TAU/3.0;
    float A = 0.15*uFan;
    float y = A*sin(ph) + 0.07*sin(x*1.4) + (r1 - .5)*0.055*uHole*(1.0 + 0.4*cos(ph));
    float z = A*0.7*sin(2.0*ph) + (r2 - .5)*0.04;
    y += uFlow*0.003*sin(x*13.0 + t*0.7 + r4*6.28);
    return vec3(uPivot + vec2(x, y), z);
  }
  vec4 braidCol(float tb){ float b = floor(r8*3.0); return paletteCol(vec3(0.1, 0.48, 0.84)[int(b)] + (r1 - .5)*0.18); }

  /* ================= BLOOM: gathering at a narrow throat, then opening out ================= */
  vec3 hornPos(float tb, float t){
    vec2 A0 = vec2(-1.05, 0.52), A1 = vec2(0.12, -0.08);           // throat off bottom-left, bell opening near the centre
    vec2 ax = mix(A0, A1, tb);
    vec2 d  = normalize(A1 - A0), n = vec2(-d.y, d.x);
    ax += n*0.12*sin(tb*PI);                                        // a gentle curve along the length
    float bell = pow(max(tb - 0.2, 0.0)/0.8, 2.4);
    float w = (0.016 + 0.30*bell*uFan) * (0.85 + 0.3*r1) * (0.6 + 0.4*uHole);
    float ang = r1*TAU*7.13 + tb*1.2*uTwist*0.3 + t*0.04;
    w *= 1.0 + uFlow*0.02*sin(tb*17.0 + t*0.5 + r3*6.28);
    return vec3(uPivot + ax + n*w*cos(ang), w*sin(ang));
  }
  vec4 hornCol(float tb){
    float p = mix(0.36, 0.95, smoothstep(0.15, 1.0, tb)) + (r1 - .5)*0.16 - step(r2, 0.22)*0.34;
    return paletteCol(p);
  }

  vec3 shapePos(int s, float tb, float t){
    if (s == 1) return wavePos(tb, t);
    if (s == 2) return vortexPos(tb, t);
    if (s == 3) return braidPos(tb, t);
    if (s == 4) return hornPos(tb, t);
    return loopPos(tb, t);
  }
  vec4 shapeCol(int s, float tb, bool hl){
    if (s == 1) return waveCol(tb);
    if (s == 2) return vortexCol(tb);
    if (s == 3) return braidCol(tb);
    if (s == 4) return hornCol(tb);
    return loopCol(tb, hl);
  }

  // art space -> view space: rotate about the pivot (turn, tilt, rotate + gentle sway)
  vec3 toView(vec3 P, float t){
    vec3 q = P - vec3(uPivot, 0.0);
    float rz = uRot.z, ry = uRot.x + uMouse.x*0.05 + 0.02*sin(t*0.11), rx = uRot.y - uMouse.y*0.04;
    q = vec3(q.x*cos(rz) - q.y*sin(rz), q.x*sin(rz) + q.y*cos(rz), q.z);
    q = vec3(q.x*cos(ry) + q.z*sin(ry), q.y, -q.x*sin(ry) + q.z*cos(ry));
    q = vec3(q.x, q.y*cos(rx) - q.z*sin(rx), q.y*sin(rx) + q.z*cos(rx));
    return q;
  }
  vec3 bodyView(float tb, float t){
    vec3 P = shapePos(SA, tb, t);
  #if MORPH
    P = mix(P, shapePos(SB, tb, t), uMorph);
  #endif
    return toView(P, t);
  }
  float persp(float z){ return 1.0 / max(0.25, 1.0 - z*uDepth); }
  vec2 toScreen(vec3 q){ return uPivotPx + q.xy * persp(q.z) * uPxScale; }

  // a point along the strip, including the straight tails that run off-screen
  vec3 pointAt(float idx, float t, out float tb){
    float N = float(uSeg), T = float(uTailPts), B = N - T;
    if (uHalf == 0){
      if (idx < T){                                                 // tail in
        tb = 0.0;
        vec3 q0 = bodyView(0.0, t), q1 = bodyView(0.004, t);
        vec2 dir = normalize(q0.xy - q1.xy + 1e-6);
        return vec3(q0.xy + dir * (uTail / persp(q0.z)) * (T - idx)/T, q0.z);
      }
      tb = 0.5*(idx - T)/B;
    } else {
      if (idx > B){                                                 // tail out
        tb = 1.0;
        vec3 q0 = bodyView(1.0, t), q1 = bodyView(0.996, t);
        vec2 dir = normalize(q0.xy - q1.xy + 1e-6);
        return vec3(q0.xy + dir * (uTail / persp(q0.z)) * (idx - B)/T, q0.z);
      }
      tb = 0.5 + 0.5*idx/B;
    }
    return bodyView(tb, t);
  }

  void main(){
    int   i    = gl_VertexID / 2;
    float side = float(gl_VertexID - i*2) * 2.0 - 1.0;
    float fi = float(gl_InstanceID + uInstBase);
    r1=h1(fi*1.13); r2=h1(fi*2.71+1.); r3=h1(fi*3.33+2.); r4=h1(fi*5.17+3.); r5=h1(fi*7.07+4.); r6=h1(fi*9.91+5.); r8=h1(fi*13.7+7.);
    float t = uTime, tb, tbN;

    vec3 q  = pointAt(float(i), t, tb);
    vec3 qn = pointAt(float(i) + 0.5, t, tbN);
    vec2 a = toScreen(q), b = toScreen(qn);
    vec2 tg = b - a; float tl = length(tg);
    tg = tl > 1e-4 ? tg / tl : vec2(1., 0.);

    bool  hl = uIsHl == 1;
    float k  = persp(q.z);
    float w  = uThick * uDpr * (hl ? 1.9 : 1.0) * (0.75 + 0.5*r5) * k;   // nearer strands are thicker
    float halfW = max(w, 1.0) * 0.5;
    float reach = halfW + 1.0;
    vec2 px = a + vec2(-tg.y, tg.x) * side * reach;
    vec2 clip = px / uRes * 2.0 - 1.0;
    gl_Position = vec4(clip.x, -clip.y, 0., 1.);
    vAcross = side * reach; vHalf = halfW; vHl = hl ? 1.0 : 0.0;

    /* ----- colour ----- */
    vec4 ca = shapeCol(SA, tb, hl);
  #if MORPH
    ca = mix(ca, shapeCol(SB, tb, hl), uMorph);
  #endif
    vec3 col = ca.rgb; float alpha = ca.a;
    if (r6 > 1.0 - 0.10*uAccent){ col = mix(col, mix(vec3(.96,.72,.22), vec3(.85,.28,.20), r4), .75); alpha = max(alpha, .6); }
    else if (r6 < 0.05*uAccent) col = mix(col, vec3(.50,.84,.78), .6);
    col *= 0.82 + r5*0.34;
    float band = 0.5 + 0.5*sin(tb*TAU*2.2 - t*0.6 + r2*1.5 + r1*5.0);
    col += uShimmer * pow(band, 14.0) * 0.22 * vec3(1., .95, .88);
    if (hl){
      float hf = hlFade(SA, tb);
  #if MORPH
      hf = mix(hf, hlFade(SB, tb), uMorph);
  #endif
      col = mix(col, vec3(.99,.95,.90), .6); alpha = .9 * (0.75 + 0.25*r5) * hf;
    }

    // depth: farther strands fade into the paper
    float fog = clamp(-q.z * uFog, 0.0, 0.85);
    col = mix(col, uPaperC, fog);
    alpha *= 1.0 - 0.55*fog;

    alpha *= clamp(w, 0.35, 1.0);
    col = hueShift(col, uHue);
    col = mix(vec3(dot(col, vec3(.299,.587,.114))), col, uSat) * uBright;
    alpha = clamp(alpha * uOpacity, 0., 1.);
    vCol = vec4(clamp(col,0.,1.) * alpha, alpha);
  }`;
  const thFS = `#version 300 es
  precision highp float;
  in vec4 vCol; in float vAcross, vHalf, vHl; out vec4 frag;
  void main(){
    float d  = abs(vAcross);
    float aa = clamp(vHalf + 0.5 - d, 0.0, 1.0);           // 1px soft edge
    float x  = clamp(d / max(vHalf, 0.5), 0.0, 1.0);        // 0 at the core .. 1 at the edge
    vec3 c = vCol.rgb * (1.0 - 0.38*x*x*smoothstep(1.0, 2.5, vHalf));   // rounded shading on wider strands
    c += vHl * vCol.a * pow(1.0 - x, 3.0) * 0.8 * vec3(1.0, .99, .97); // specular core on white strands
    frag = vec4(min(c, vec3(vCol.a)), vCol.a) * aa;
  }`;

  function prog(vs, fs){
    const p = gl.createProgram();
    [[gl.VERTEX_SHADER,vs],[gl.FRAGMENT_SHADER,fs]].forEach(([k,src])=>{
      const s = gl.createShader(k); gl.shaderSource(s,src); gl.compileShader(s);
      if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(p,s);
    });
    gl.linkProgram(p);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }
  const bg = prog(bgVS, bgFS);
  const UNI = ['uSeg','uHalf','uInstBase','uIsHl','uTailPts','uTime','uFlow','uTwist','uShimmer','uMorph','uRes','uMouse','uPivot','uPivotPx','uRot','uPaperC','uPxScale','uDepth','uFog','uTail','uFan','uHole','uOpacity','uWarm','uAccent','uHue','uSat','uBright','uThick','uDpr'];
  const progs = {};                                            // compiled on first use, then cached
  function thProgram(a, b, morph){
    const key = morph ? a + '-' + b : String(a);
    if (!progs[key]){
      const p = prog(thVS(a, morph ? b : a, morph), thFS), u = {};
      UNI.forEach(n => u[n] = gl.getUniformLocation(p, n));
      progs[key] = { p, u };
    }
    return progs[key];
  }
  const uBgRes = gl.getUniformLocation(bg,'uRes'), uBgPaper = gl.getUniformLocation(bg,'uPaper');
  const hex = h => { const n = parseInt(h.replace('#',''),16); return [(n>>16&255)/255,(n>>8&255)/255,(n&255)/255]; };
  gl.bindVertexArray(gl.createVertexArray());

  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let t = 0, last = 0, raf = 0, running = true, visible = true, resumed = true, due = 0;
  const mouse = {x:0,y:0,tx:0,ty:0};
  let L = {W:1,H:1,s:1,dpr:1,pivotPx:[0,0],pxScale:1,tail:1};
  const PIVOT = [0.35, 0.36];                                  // shape centre, in art units
  const TAIL_PTS = 3;
  // path morphing: A is shown, blending towards B as m goes 0 -> 1
  const idx = name => Math.max(0, PATHS.indexOf(name));
  const shape = { a: idx(o.path), b: idx(o.path), m: 0, from: 0, anim: false };
  function goTo(name){
    const n = idx(name);
    if (shape.anim){ shape.a = shape.b; }                        // interrupting a morph: continue from its target
    else if (n === shape.a) return;
    shape.b = n; shape.m = 0; shape.anim = true; shape.from = performance.now();
    if (reduce.matches || !running){ shape.a = n; shape.m = 0; shape.anim = false; }
  }
  function stepMorph(now){
    if (!shape.anim) return;
    const k = Math.min(1, (now - shape.from) / (o.morphTime*1000));
    shape.m = k*k*(3 - 2*k);                                    // ease in and out
    if (k >= 1){ shape.a = shape.b; shape.m = 0; shape.anim = false; }
  }

  /* ---------- adaptive quality ----------
     When the frame rate misses the target, step down the ladder: resolution first
     (the biggest cost: every strand is filled per pixel), then thread count, then points
     per thread. With headroom for a while, try one step back up; if that step fails
     straight away, stay put for 30s before trying again. */
  const LADDER = [            // [resolution, threads, points]
    [1.00, 1.00, 1.00], [0.85, 1.00, 1.00], [0.75, 0.85, 1.00], [0.75, 0.70, 0.85],
    [0.65, 0.60, 0.75], [0.55, 0.50, 0.65], [0.50, 0.40, 0.55]
  ];
  const perf = { level: 0, frames: 0, time: 0, changedAt: 0, steppedUpAt: -1e9, holdUntil: 0 };
  function setLevel(n, now){
    n = Math.max(0, Math.min(LADDER.length - 1, n));
    if (n === perf.level) return;
    if (n > perf.level && now - perf.steppedUpAt < 4000) perf.holdUntil = now + 30000;   // the step up didn't hold
    if (n < perf.level) perf.steppedUpAt = now;
    perf.level = n; perf.changedAt = now; perf.frames = 0; perf.time = 0;
    layout();
  }
  function measure(dt, now){
    if (!dt) return;
    perf.frames++; perf.time += dt;
    if (perf.time < 1 || now - perf.changedAt < 1500) return;   // 1s windows, ignoring a settle period after changes
    const fps = perf.frames / perf.time;
    perf.frames = 0; perf.time = 0;
    const target = o.maxFps > 0 && o.targetFps > 0 ? Math.min(o.targetFps, o.maxFps) : o.targetFps;
    if (target > 0){
      if (fps < target * 0.9) setLevel(perf.level + 1, now);
      else if (fps >= target * 0.97 && perf.level > 0 && now - perf.changedAt > 6000 && now > perf.holdUntil) setLevel(perf.level - 1, now);
    } else if (perf.level) setLevel(0, now);
    o.onPerf && o.onPerf(Object.assign({ fps: Math.round(fps) }, stats()));
  }

  // what's actually being drawn right now, for the readouts
  let gpu = '';
  try { const ext = gl.getExtension('WEBGL_debug_renderer_info'); gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); } catch (e) {}
  function stats(){
    const q = LADDER[perf.level];
    return { level: perf.level, levels: LADDER.length - 1,
      threads: Math.max(200, Math.round(o.threads * q[1])), points: Math.max(48, Math.round(o.segments * q[2])),
      scale: L.dpr, width: L.W, height: L.H, gpu: gpu };
  }

  function layout(){
    const dpr = Math.max(0.5, Math.min(devicePixelRatio || 1, o.maxDpr) * LADDER[perf.level][0]);
    const W = Math.round(canvas.clientWidth*dpr), H = Math.round(canvas.clientHeight*dpr);
    if (canvas.width !== W || canvas.height !== H){ canvas.width = W; canvas.height = H; }
    const [iw, ih] = o.art;
    const share = W/H > 1.1 ? o.widthShare : 1.0;
    const s = Math.max(H/ih, share*W/iw);                    // base fit, as the photo would sit
    let oy = H*0.5 - o.focalY*ih*s; oy = Math.min(0, Math.max(H - ih*s, oy));
    const ox = W - iw*s;
    // the shape's centre on screen, moved by x/y as a share of the viewport; zoom scales about it
    const pivotPx = [ox + PIVOT[0]*ih*s + o.x*W, oy + PIVOT[1]*ih*s + o.y*H];
    const pxScale = ih*s*o.zoom;
    L = {W, H, s, dpr, pivotPx, pxScale, tail: 2.5*Math.hypot(W, H)/pxScale};
  }

  function draw(){
    gl.viewport(0,0,L.W,L.H);
    gl.disable(gl.BLEND);
    gl.useProgram(bg); gl.uniform2f(uBgRes, L.W, L.H); gl.uniform3fv(uBgPaper, hex(o.paper)); gl.drawArrays(gl.TRIANGLES,0,3);

    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const morphing = shape.m > 0.001 && shape.a !== shape.b;
    const TP = thProgram(shape.a, shape.b, morphing), u = TP.u;
    gl.useProgram(TP.p);
    const q = LADDER[perf.level];
    const seg = Math.max(48, Math.round(o.segments * q[2])) + TAIL_PTS;
    const threads = Math.max(200, Math.round(o.threads * q[1]));
    gl.uniform1i(u.uSeg, seg);
    gl.uniform1f(u.uThick, o.thickness); gl.uniform1f(u.uDpr, L.dpr);
    gl.uniform1f(u.uTime, t); gl.uniform1f(u.uFlow, o.flow); gl.uniform1f(u.uTwist, o.twist); gl.uniform1f(u.uShimmer, o.shimmer);
    gl.uniform2f(u.uRes, L.W, L.H); gl.uniform2f(u.uMouse, mouse.x*o.parallax, mouse.y*o.parallax);
    gl.uniform2f(u.uPivot, PIVOT[0], PIVOT[1]); gl.uniform2f(u.uPivotPx, L.pivotPx[0], L.pivotPx[1]);
    gl.uniform1f(u.uPxScale, L.pxScale); gl.uniform1f(u.uTail, L.tail); gl.uniform1i(u.uTailPts, TAIL_PTS);
    const D = Math.PI/180;
    gl.uniform3f(u.uRot, o.turn*D, o.tilt*D, o.rotate*D); gl.uniform1f(u.uDepth, o.depth); gl.uniform1f(u.uFog, o.fog);
    gl.uniform3fv(u.uPaperC, hex(o.paper));
    gl.uniform1f(u.uMorph, shape.m);
    gl.uniform1f(u.uFan, o.fan); gl.uniform1f(u.uHole, o.hole); gl.uniform1f(u.uOpacity, o.opacity);
    gl.uniform1f(u.uWarm, o.warmth); gl.uniform1f(u.uAccent, o.accents);
    gl.uniform1f(u.uHue, o.hue*Math.PI/180); gl.uniform1f(u.uSat, o.saturation); gl.uniform1f(u.uBright, o.brightness);
    const verts = (seg + 1) * 2;                             // one triangle strip per thread
    const hlCount = Math.round(threads * 0.008 * o.highlights);  // extra white strands, drawn on top
    for (let half = 0; half < 2; half++){                      // back of the loop first, then the front
      gl.uniform1i(u.uHalf, half);
      gl.uniform1i(u.uIsHl, 0); gl.uniform1i(u.uInstBase, 0);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, verts, threads);
      if (hlCount){
        gl.uniform1i(u.uIsHl, 1); gl.uniform1i(u.uInstBase, threads);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, verts, hlCount);
      }
    }
  }

  function frame(now){
    raf = 0;
    // frame cap: skip display refreshes until the next frame is due. Frames are scheduled on a
    // running clock (not "time since last frame"), so a 30 cap gives 30 on 60, 75, 144Hz... screens
    if (o.maxFps > 0){
      const interval = 1000 / o.maxFps;
      if (due && now < due - 2){ loop(); return; }           // 2ms tolerance for timer jitter
      due = (due && now - due < interval) ? due + interval : now + interval;   // resync after a stall
    } else due = 0;
    const raw = last ? (now-last)/1000 : 0; last = now;
    if (raw && !resumed) measure(raw, now);
    resumed = false;
    const dt = Math.min(raw, 0.05);
    t += dt*o.speed;
    const ease = 1 - Math.pow(0.97, dt*60);                    // same easing speed at any frame rate
    mouse.x += (mouse.tx-mouse.x)*ease; mouse.y += (mouse.ty-mouse.y)*ease;
    stepMorph(performance.now());
    draw(); loop();
  }
  function loop(){
    if (running && visible && !reduce.matches && !raf) raf = requestAnimationFrame(frame);
    else if (!raf){ last = 0; due = 0; resumed = true; }
  }
  function still(){ layout(); draw(); }

  thProgram(shape.a, shape.a, false);
  still(); loop();
  new ResizeObserver(still).observe(canvas);
  new IntersectionObserver(e => { visible = e[0].isIntersecting; loop(); }).observe(canvas);
  reduce.addEventListener?.('change', () => { still(); loop(); });
  document.addEventListener('visibilitychange', () => { resumed = true; perf.frames = 0; perf.time = 0; });   // don't count time spent in a background tab
  addEventListener('pointermove', e => {
    const r = canvas.getBoundingClientRect();
    mouse.tx = ((e.clientX-r.left)/r.width - .5)*2; mouse.ty = ((e.clientY-r.top)/r.height - .5)*2;
  }, {passive:true});

  return {
    set(v){
      if ('path' in v && v.path !== o.path) goTo(v.path);
      Object.assign(o, v);
      layout();                                                  // position, zoom and quality live here, so always refresh
      if (!raf) draw();
    },
    // for scroll-driven morphs later: show path a blended towards b by m (0..1)
    blend(a, b, m){ shape.anim = false; shape.a = idx(a); shape.b = idx(b); shape.m = Math.max(0, Math.min(1, m)); if (!raf) still(); },
    paths: PATHS.slice(),
    get(){ return Object.assign({}, o); },
    quality(){ return stats(); },
    pause(p){ running = !p; if (p) still(); loop(); },
    time(v){ t = v; still(); }
  };
}

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
    path: 'loop', morphTime: 1.8,
    speed: 1, flow: 1.9, twist: 3, shimmer: 1.05, parallax: 1.45,
    fan: 1.24, hole: 1.4,
    threads: 1500, mobileThreads: 1000, thickness: 1.55, highlights: 1, opacity: 1.01, warmth: 0.6, accents: 2.2,
    targetFps: 60, maxFps: 30,
    hue: 0, saturation: 0.83, brightness: 1, paper: '#efe1dc',
    x: 0, y: 0, zoom: 0.91, turn: 0, tilt: 0, rotate: 0, depth: 0.6, fog: 0.6,
    focalY: 0.36, widthShare: 0.54
  };

  var GROUPS = [
    { name: 'Motion', both: true, items: [
      ['speed', 'Speed', 0, 2, 0.05], ['flow', 'Flow', 0, 3, 0.05], ['twist', 'Twist', 0, 5, 0.05],
      ['shimmer', 'Shimmer', 0, 2, 0.05], ['parallax', 'Mouse tilt', 0, 3, 0.05, null, true] ]},
    { name: 'Path', items: [ ['path', 'Path', 'path'], ['morphTime', 'Morph time', 0.3, 5, 0.1, 1],
      ['fan', 'Spread', 0.5, 1.8, 0.01], ['hole', 'Opening', 0.4, 2.4, 0.01] ]},
    { name: 'Position', items: [
      ['x', 'X', -1, 1, 0.01], ['y', 'Y', -1, 1, 0.01], ['zoom', 'Zoom', 0.25, 3, 0.01],
      ['turn', 'Turn', -70, 70, 1, 0], ['tilt', 'Tilt', -70, 70, 1, 0], ['rotate', 'Rotate', -180, 180, 1, 0],
      ['depth', 'Depth', 0, 1.5, 0.01], ['fog', 'Fog', 0, 2, 0.01] ]},
    { name: 'Threads', items: [
      ['threads', 'Count', 400, 4000, 100, 0], ['mobileThreads', 'On phones', 400, 3000, 100, 0],
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
  var PATH_NAMES = [['loop', 'Loop'], ['wave', 'Waveform'], ['vortex', 'Vortex'], ['braid', 'Braid'], ['bloom', 'Bloom']];

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
.wth-stats{position:fixed;left:12px;bottom:12px;z-index:2147483000;margin:0;padding:8px 10px;border-radius:8px;background:rgba(20,14,24,.82);color:#f6eeea;font:11px/1.45 ui-monospace,Menlo,Consolas,monospace;white-space:pre;pointer-events:none}\
.wth-pathrow{grid-template-columns:76px 1fr}\
.wth-pathrow .wth-lbl{align-self:start;padding-top:5px}\
.wth-pathset{display:flex;flex-wrap:wrap;gap:4px}\
.wth-pathset button{border:1px solid rgba(42,30,49,.2);background:transparent;border-radius:999px;padding:4px 9px;font:500 12px system-ui,sans-serif;color:#2a1e31;cursor:pointer}\
.wth-pathset button[aria-pressed="true"]{background:#2a1e31;color:#f6eeea;border-color:#2a1e31}\
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
    var showPerf = /[?&]perf(=|&|$)/.test(location.search);        // ?perf: live stats overlay for testing on real machines
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
      var o = Object.assign({ maxDpr: 1.5, onPerf: function(p){
        var q = p.level ? 'quality stepped down ' + p.level + ' of ' + p.levels : 'full quality';
        if (perfOut) perfOut.textContent = p.fps + ' fps · ' + q;
        if (perfBox) perfBox.textContent =
          p.fps + ' fps (cap ' + (state.maxFps || 'off') + ', target ' + (state.targetFps || 'off') + ')\n' + q + '\n' +
          p.threads + ' threads × ' + p.points + ' points\n' +
          p.width + '×' + p.height + ' px at ' + p.scale.toFixed(2) + '× (screen ' + (window.devicePixelRatio || 1) + '×)\n' +
          (p.gpu || 'GPU name hidden by browser');
      } }, state);
      o.threads = narrow() ? Math.min(state.mobileThreads, state.threads) : state.threads;
      return o;
    }
    var threads = null, perfOut = null, perfBox = null;
    if (showPerf){
      perfBox = document.createElement('pre'); perfBox.className = 'wth-stats'; perfBox.textContent = 'Measuring…';
      document.body.appendChild(perfBox);
    }
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
      blend: function(a, b, m){ threads && threads.blend(a, b, m); },   // hold a morph part-way (for scroll-driven sections)
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
        grp.className = 'wth-group'; if (g.both) grp.setAttribute('data-both', ''); if (g.photo) grp.setAttribute('data-photo', '');
        grp.innerHTML = '<h3>' + g.name + '</h3>';
        g.items.forEach(function(it){
          var k = it[0], id = 'wth-' + k, row = document.createElement('div');
          row.className = 'wth-row';
          if (it[2] === 'path'){                                    // one button per path
            row.className = 'wth-row wth-pathrow';
            row.innerHTML = '<span class="wth-lbl" id="wth-lbl-path">' + it[1] + '</span><div class="wth-pathset" role="group" aria-labelledby="wth-lbl-path">' +
              PATH_NAMES.map(function(p){ return '<button type="button" data-path="' + p[0] + '" aria-pressed="' + (p[0] === state.path) + '">' + p[1] + '</button>'; }).join('') + '</div>';
            var btns = row.querySelectorAll('[data-path]');
            var syncP = function(){ btns.forEach(function(b){ b.setAttribute('aria-pressed', String(b.getAttribute('data-path') === state.path)); }); };
            btns.forEach(function(b){ b.addEventListener('click', function(){ state.path = b.getAttribute('data-path'); syncP(); apply({ path: state.path }); }); });
            inputs[k] = { sync: syncP };
            grp.appendChild(row); return;
          }
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
        Object.assign(state, DEFAULTS, saved);
        Object.keys(inputs).forEach(function(k){
          var r = inputs[k]; if (r.sync){ r.sync(); return; } r.input.value = state[k]; if (r.out) r.out.value = fmt(state[k], r.dp);
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

})();
