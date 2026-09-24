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
