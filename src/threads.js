/* ============================================================
   Silk threads — procedural, WebGL2, no library.
   Every thread is a ribbon (an instanced triangle strip) whose shape,
   width and colour are computed in the vertex shader (no buffers).

   Model: each thread is one loop drawn in two halves.
   Back half: the inside wall of a funnel, stretched between an
   off-frame rim and the edge of the hole.
   Front half: one of a family of ellipses that all pass through the
   pinch, growing and dropping as the thread sits further out.

   mwpThreads(canvas, opts) returns { set(obj), get(), pause(bool) }
   ============================================================ */
function mwpThreads(canvas, opts){
  const o = Object.assign({
    threads: 1500,          // number of threads
    segments: 180,          // points per half-loop (quality ladder scales this)
    thickness: 1.55,        // strand width in CSS pixels
    highlights: 1,          // amount of thicker white strands
    targetFps: 60,          // adaptive quality: 0 = off
    onPerf: null,           // callback({fps, level, levels}) about once a second
    focalY: 0.36, widthShare: 0.54,
    art: [1400, 2304],      // artwork frame in px (matches the photo so layouts line up)
    speed: 1, flow: 1.9, twist: 3, shimmer: 1.05, parallax: 1.45,   // motion
    fan: 1.24, hole: 1.09,                                   // shape
    opacity: 1.01, warmth: 0.6, accents: 2.2,                // threads
    hue: 0, saturation: 0.83, brightness: 1,                 // colour
    paper: '#efe1dc',                                        // background
    zoom: 0.91, shiftX: 0,                                   // framing
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

  /* ---------- threads ---------- */
  const thVS = `#version 300 es
  precision highp float;
  uniform int uSeg, uHalf, uInstBase, uIsHl;
  uniform float uTime, uFlow, uTwist, uShimmer;
  uniform vec2 uRes, uOffset, uArt, uMouse;
  uniform float uScale, uFan, uHole, uOpacity, uWarm, uAccent, uHue, uSat, uBright, uThick, uDpr;
  out vec4 vCol;
  out float vAcross, vHalf, vHl;

  const float PI = 3.14159265, TAU = 6.2831853;
  vec3 hueShift(vec3 c, float h){
    const mat3 toYIQ=mat3(.299,.596,.211,.587,-.274,-.523,.114,-.322,.312);
    const mat3 toRGB=mat3(1.,1.,1.,.956,-.272,-1.106,.621,-.647,1.703);
    vec3 yiq=toYIQ*c; float s=sin(h), co=cos(h);
    yiq.yz=mat2(co,s,-s,co)*yiq.yz; return toRGB*yiq;
  }
  float h1(float n){ return fract(sin(n*127.1 + 3.7)*43758.5453); }

  vec3 pal(float x){                       // along-the-band colour for the dense inner threads
    // x: 0 = pinch (going up/back) .. 1 = back right .. 2 = pinch again via the front
    vec3 purpleDk = vec3(.20,.06,.24), purple = vec3(.42,.17,.48), plum = vec3(.55,.24,.55);
    vec3 teal = vec3(.03,.42,.44), green = vec3(.07,.50,.36), jade = vec3(.36,.72,.58);
    vec3 c = mix(purpleDk, teal, smoothstep(.02,.22,x));
    c = mix(c, green, smoothstep(.30,.55,x));
    c = mix(c, jade, smoothstep(.55,.75,x)*.5);
    c = mix(c, purpleDk, smoothstep(.85,1.08,x));
    c = mix(c, purple, smoothstep(1.1,1.35,x));
    c = mix(c, plum, smoothstep(1.5,1.9,x)*.6);
    return c;
  }

  // where a thread sits at angle phi, in canvas pixels
  vec2 placeAt(float phi, float r1, float r2, float r3, float r4, float t){
    float th0 = 2.779 + phi;                                // angle around the loop (pinch on its lower-left flank)
    float oF = pow(r1, 2.1);                 // front: dense purple edge, sparse fan
    float oB = pow(r1, 1.25);                // back wall: evenly packed

    // centreline: outer rim of the funnel (top, off-frame) and inner edge of the front band
    vec2  cc = vec2(0.550, 0.000);
    vec2  R  = vec2(0.400, 0.335) * (1.0 + (r2-.5)*.03);
    float breathe = 1.0 + 0.012*uTwist*sin(t*0.23);
    vec3  C  = vec3(cc + R*breathe*vec2(cos(th0), sin(th0)), sin(th0)*0.22);
    float backW = 1.0 - smoothstep(0.85*PI, 1.15*PI, phi);
    float o = mix(oF, oB, backW);

    // FRONT: a family of ellipses that all pass through the pinch, growing and
    // dropping as the thread sits further out, so the fan stays round
    float of = oF * (1.0 + 0.035*uTwist*sin(t*0.21 + r3*6.28));
    vec2  pin0 = cc + R*vec2(cos(2.779), sin(2.779));
    vec2  fc = mix(cc, pin0 + (vec2(0.550, 0.455) - pin0)*uFan, of) + vec2(0.006, 0.01)*uTwist*sin(t*0.17 + of*3.0);
    vec2  fR = mix(R, vec2(0.485, 0.535)*uFan, of) * (1.0 + 0.01*uTwist*sin(t*0.23 + 2.0));
    float fp = mix(2.779, 3.835, of);                    // angle at which this ellipse meets the pinch
    float fa = fp + phi;
    vec3 Pf = vec3(fc + fR*vec2(cos(fa), sin(fa)), sin(fa)*0.22*(1.0 + of));
    // ease every ellipse exactly into the pinch point
    vec2 miss  = pin0 - (fc + fR*vec2(cos(fp), sin(fp)));
    Pf.xy += miss * smoothstep(1.35*PI, 2.0*PI, phi);
    Pf.z  += 0.22*sin(2.779) - 0.22*(1.0 + of)*sin(fp);      // same depth at the crossing, so tilt can't split it
    // lift the inner edge of the front so it overlaps the start of the wall (no seam near the crossing)
    Pf.y -= (1.0 - of) * (0.010*smoothstep(1.3*PI, 1.6*PI, phi) + 0.022*smoothstep(1.55*PI, 1.8*PI, phi)*(1.0 - smoothstep(1.86*PI, 2.0*PI, phi)));

    // BACK: the inside wall of the funnel, stretched between the rim (C, off the top)
    // and the edge of the hole, which it follows smoothly round from bottom-left
    vec2  hc = vec2(0.522, 0.188), hr = vec2(0.160, 0.150) * uHole * (1.0 + 0.02*uTwist*sin(t*0.23 + 1.0));
    float psi = 0.52*PI + 1.58*PI*pow(clamp(phi/PI, 0., 1.), 1.25) + 0.03*uTwist*sin(t*0.17);
    vec3  I   = vec3(hc + hr*vec2(cos(psi), sin(psi)) + vec2(0., 0.012), -0.12);
    float open = smoothstep(0.0, 0.10*PI, phi);            // edge-on at the pinch
    float ob = oB * open * (1.0 + 0.04*sin(t*0.31 + r4*6.28));
    vec3 Pb = mix(C, I, ob);
    Pb.xy += vec2(-0.015, 0.05) * sin(ob*PI) * (1.0 - smoothstep(0.2*PI, 0.5*PI, phi)*.6);   // the wall bows as it descends

    vec3 P = mix(Pf, Pb, backW);

    // slow flow: every thread undulates on its own phase, except at the crossing
    float amp = uFlow * (0.0025 + 0.009*o);
    float waist = 1.0 - exp(-pow((phi - TAU)/(0.22*PI), 2.0));
    waist *= mix(1.0, smoothstep(0.0, 0.2*PI, phi), backW);
    P.xy += waist * amp * vec2(sin(phi*3.0 + t*0.42 + r3*6.28), cos(phi*2.0 - t*0.35 + r4*6.28));

    // gentle 3D sway (time + pointer)
    float ry = uMouse.x*0.05 + 0.02*sin(t*0.11), rx = -uMouse.y*0.04;
    vec3 q = P - vec3(cc, 0.);
    q = vec3(q.x*cos(ry) + q.z*sin(ry), q.y, -q.x*sin(ry) + q.z*cos(ry));
    q = vec3(q.x, q.y*cos(rx) - q.z*sin(rx), q.y*sin(rx) + q.z*cos(rx));
    P = q + vec3(cc, 0.);
    return uOffset + P.xy * uArt.y * uScale;
  }

  void main(){
    // one instance per thread; each is a triangle strip of N+1 point pairs
    int   i    = gl_VertexID / 2;
    float side = float(gl_VertexID - i*2) * 2.0 - 1.0;
    float fi = float(gl_InstanceID + uInstBase);
    float r1=h1(fi*1.13), r2=h1(fi*2.71+1.), r3=h1(fi*3.33+2.), r4=h1(fi*5.17+3.), r5=h1(fi*7.07+4.), r6=h1(fi*9.91+5.);
    float t = uTime;

    // back half: 0..PI. front half: PI..TAU+EXT, carrying on through the pinch and off the
    // top of the frame, so no thread starts or stops where it can be seen
    const float EXT = 0.34*PI;
    float span = uHalf == 0 ? PI : PI + EXT;
    float phi  = (uHalf == 0 ? 0.0 : PI) + span * float(i) / float(uSeg);
    float dphi = span / float(uSeg);

    // centre point and direction of the strand in screen space
    vec2 a  = placeAt(phi, r1, r2, r3, r4, t);
    vec2 b  = placeAt(phi + dphi*0.5, r1, r2, r3, r4, t);
    vec2 tg = b - a; float tl = length(tg);
    tg = tl > 1e-4 ? tg / tl : vec2(1., 0.);

    // strand width in device pixels; highlight strands are thicker
    bool  hl = uIsHl == 1;                                  // white strands draw last, on top
    float w  = uThick * uDpr * (hl ? 1.9 : 1.0) * (0.75 + 0.5*r5);
    float halfW = max(w, 1.0) * 0.5;
    float reach = halfW + 1.0;                              // + 1px for the soft edge
    vec2 px = a + vec2(-tg.y, tg.x) * side * reach;
    vec2 clip = px / uRes * 2.0 - 1.0;
    gl_Position = vec4(clip.x, -clip.y, 0., 1.);
    vAcross = side * reach; vHalf = halfW; vHl = hl ? 1.0 : 0.0;

    float oF = pow(r1, 2.1), oB = pow(r1, 1.25);
    float backW = 1.0 - smoothstep(0.85*PI, 1.15*PI, phi);
    float o = mix(oF, oB, backW);

    /* ----- colour ----- */
    float x = phi / PI;
    float backness = 1.0 - smoothstep(0.85, 1.25, x);
    // back wall: dark teal at the rim, greens and mint deeper in
    float ow = o + (r3-.5)*.18;
    vec3 wall = mix(vec3(.50,.76,.62), vec3(.07,.50,.34), smoothstep(.05,.40,ow));
    wall = mix(wall, vec3(.02,.36,.42), smoothstep(.55,.85,ow));
    wall = mix(wall, vec3(.03,.22,.30), smoothstep(.85,1.0,ow)*.7);
    wall = mix(wall, vec3(.92,.78,.76), step(.93, r4)*.7);                // stray pale threads
    wall = mix(vec3(.18,.05,.22), wall, smoothstep(.02,.20,x));            // dark near the pinch
    // front: purple body, warm threads woven through, pale fan outside
    vec3 purple = mix(vec3(.20,.06,.24), vec3(.46,.20,.52), smoothstep(.0,.12,o));
    purple = mix(purple, vec3(.56,.26,.58), smoothstep(.12,.30,o));
    vec3 warm = mix(vec3(.72,.18,.16), vec3(.93,.52,.18), r3);
    vec3 pale = mix(vec3(.95,.84,.80), vec3(.55,.80,.66), smoothstep(.35,.75,r4)*(1.0-smoothstep(1.62,1.8,x)));
    vec3 fr = purple;
    fr = mix(fr, warm, smoothstep(.24,.36,o) * step(1.0 - uWarm, r5+o*.3));
    fr = mix(fr, pale, smoothstep(.40,.66,o+(r5-.5)*.25) * step(.12, r4));
    vec3 col = mix(fr, wall, backness);
    // accent threads
    if (r6 > 1.0 - 0.10*uAccent) col = mix(col, mix(vec3(.96,.72,.22), vec3(.85,.28,.20), r4), .75);   // gold / vermilion
    else if (r6 < 0.05*uAccent) col = mix(col, vec3(.50,.84,.78), .6);                            // aqua
    col *= 0.82 + r5*0.34;
    col *= mix(1.0, 0.72, smoothstep(TAU, TAU + 0.12*PI, phi) * (1.0 - smoothstep(.3,.7,o)));

    // travelling sheen along the threads
    float band = 0.5 + 0.5*sin(phi*2.0 - t*0.6 + r2*1.5 + o*5.0);
    col += uShimmer * pow(band, 14.0) * 0.22 * vec3(1., .95, .88);

    float alpha = mix(0.72, 0.22, smoothstep(0., .8, o)*(1.0-backW*.6)) * (0.45 + 0.55*r5);
    alpha *= 1.0 - 0.45*smoothstep(.35,.8,o)*(1.0-backW);
    if (r6 > 1.0 - 0.10*uAccent) alpha = max(alpha, .6);
    // back wall fades in above the frame; front threads fade out after leaving it
    alpha *= mix(1.0, smoothstep(0.0, 0.05*PI, phi), backW);
    alpha *= 1.0 - 0.85*smoothstep(TAU, TAU + 0.08*PI, phi)*smoothstep(.18, .5, o)*(1.0-backW);
    alpha *= 1.0 - smoothstep(TAU + EXT*0.6, TAU + EXT, phi);
    // white strands: pale cream, more opaque, picked out by a specular core in the fragment shader
    if (hl){ col = mix(col, vec3(.99,.95,.90), .6); alpha = max(alpha, .9 * (0.75 + 0.25*r5)) * (1.0 - 0.75*exp(-pow((phi - TAU)/(0.14*PI), 2.0))) * mix(1.0, smoothstep(0.1*PI, 0.3*PI, phi), backW) * mix(1.0, smoothstep(0.0, 0.05*PI, phi), backW) * (1.0 - smoothstep(TAU + EXT*0.6, TAU + EXT, phi)); }
    alpha *= clamp(w, 0.35, 1.0);                          // strands thinner than a pixel get fainter, not jagged
    col = hueShift(col, uHue);
    col = mix(vec3(dot(col, vec3(.299,.587,.114))), col, uSat) * uBright;
    alpha = clamp(alpha * uOpacity, 0., 1.);
    vCol = vec4(clamp(col,0.,1.) * alpha, alpha);             // premultiplied
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
  const bg = prog(bgVS, bgFS), th = prog(thVS, thFS);
  const U = n => gl.getUniformLocation(th, n);
  const u = {}; ['uSeg','uHalf','uInstBase','uIsHl','uTime','uFlow','uTwist','uShimmer','uRes','uOffset','uArt','uMouse','uScale','uFan','uHole','uOpacity','uWarm','uAccent','uHue','uSat','uBright','uThick','uDpr'].forEach(n=>u[n]=U(n));
  const uBgRes = gl.getUniformLocation(bg,'uRes'), uBgPaper = gl.getUniformLocation(bg,'uPaper');
  const hex = h => { const n = parseInt(h.replace('#',''),16); return [(n>>16&255)/255,(n>>8&255)/255,(n&255)/255]; };
  gl.bindVertexArray(gl.createVertexArray());

  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let t = 0, last = 0, raf = 0, running = true, visible = true, resumed = true;
  const mouse = {x:0,y:0,tx:0,ty:0};
  let L = {W:1,H:1,s:1,ox:0,oy:0,dpr:1};

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
    const target = o.targetFps;
    if (target > 0){
      if (fps < target * 0.9) setLevel(perf.level + 1, now);
      else if (fps >= target * 0.97 && perf.level > 0 && now - perf.changedAt > 6000 && now > perf.holdUntil) setLevel(perf.level - 1, now);
    } else if (perf.level) setLevel(0, now);
    o.onPerf && o.onPerf({ fps: Math.round(fps), level: perf.level, levels: LADDER.length - 1 });
  }

  function layout(){
    const dpr = Math.max(0.5, Math.min(devicePixelRatio || 1, o.maxDpr) * LADDER[perf.level][0]);
    const W = Math.round(canvas.clientWidth*dpr), H = Math.round(canvas.clientHeight*dpr);
    if (canvas.width !== W || canvas.height !== H){ canvas.width = W; canvas.height = H; }
    const [iw, ih] = o.art;
    const share = W/H > 1.1 ? o.widthShare : 1.0;
    const s = Math.max(H/ih, share*W/iw) * o.zoom;
    let oy = H*0.5 - o.focalY*ih*s; if (ih*s >= H) oy = Math.min(0, Math.max(H - ih*s, oy));
    L = {W, H, s, ox: W - iw*s + o.shiftX*W, oy, dpr};
  }

  function draw(){
    gl.viewport(0,0,L.W,L.H);
    gl.disable(gl.BLEND);
    gl.useProgram(bg); gl.uniform2f(uBgRes, L.W, L.H); gl.uniform3fv(uBgPaper, hex(o.paper)); gl.drawArrays(gl.TRIANGLES,0,3);

    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(th);
    const q = LADDER[perf.level];
    const seg = Math.max(48, Math.round(o.segments * q[2]));
    const threads = Math.max(200, Math.round(o.threads * q[1]));
    gl.uniform1i(u.uSeg, seg);
    gl.uniform1f(u.uThick, o.thickness); gl.uniform1f(u.uDpr, L.dpr);
    gl.uniform1f(u.uTime, t); gl.uniform1f(u.uFlow, o.flow); gl.uniform1f(u.uTwist, o.twist); gl.uniform1f(u.uShimmer, o.shimmer);
    gl.uniform2f(u.uRes, L.W, L.H); gl.uniform2f(u.uOffset, L.ox, L.oy); gl.uniform2f(u.uArt, o.art[0], o.art[1]);
    gl.uniform1f(u.uScale, L.s); gl.uniform2f(u.uMouse, mouse.x*o.parallax, mouse.y*o.parallax);
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
    const raw = last ? (now-last)/1000 : 0; last = now;
    if (raw && !resumed) measure(raw, now);
    resumed = false;
    const dt = Math.min(raw, 0.05);
    t += dt*o.speed;
    mouse.x += (mouse.tx-mouse.x)*0.03; mouse.y += (mouse.ty-mouse.y)*0.03;
    draw(); loop();
  }
  function loop(){
    if (running && visible && !reduce.matches && !raf) raf = requestAnimationFrame(frame);
    else if (!raf){ last = 0; resumed = true; }
  }
  function still(){ layout(); draw(); }

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
    set(v){ Object.assign(o, v); if (!raf) still(); },
    get(){ return Object.assign({}, o); },
    quality(){ return { level: perf.level, levels: LADDER.length - 1 }; },
    pause(p){ running = !p; if (p) still(); loop(); },
    time(v){ t = v; still(); }
  };
}
