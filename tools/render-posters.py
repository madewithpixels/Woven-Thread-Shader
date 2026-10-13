"""Render the still posters from the shader at the current defaults.

Run from the repo root after changing DEFAULTS in src/webflow-boot.js:
    python3 -m http.server 8123 &
    python3 tools/render-posters.py
Needs: pip install playwright pillow  (and a Playwright Chromium).
Writes webflow/poster-landscape.webp (1920x1080) and webflow/poster-portrait.webp (645x1398).
"""
import base64, io, json, re, subprocess
from PIL import Image
from playwright.sync_api import sync_playwright

src = open('src/webflow-boot.js').read()
obj = re.search(r'var DEFAULTS = (\{[\s\S]*?\});', src).group(1)
D = json.loads(subprocess.run(['node', '-e', 'process.stdout.write(JSON.stringify(' + obj + '))'],
                              capture_output=True, text=True, check=True).stdout)
# name, CSS width, height, pixel ratio, threads (phones are capped at 1000), output size
JOBS = [('landscape', 1920, 1080, 1, 1500, None), ('portrait', 430, 932, 2, 1000, (645, 1398))]

with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    for name, w, h, dpr, n, out in JOBS:
        p = b.new_page(viewport={'width': w, 'height': h}, device_scale_factor=dpr)
        p.goto('http://localhost:8123/tools/poster.html', wait_until='commit')
        p.wait_for_function('typeof mwpThreads === "function"', timeout=60000)
        o = dict(D, threads=n, maxDpr=dpr, targetFps=0, maxFps=0)
        url = p.evaluate("""o => { const c = document.getElementById('c'); const a = mwpThreads(c, o);
                                   a.pause(true); a.time(0); return c.toDataURL('image/png'); }""", o)
        im = Image.open(io.BytesIO(base64.b64decode(url.split(',', 1)[1]))).convert('RGB')
        if out: im = im.resize(out, Image.LANCZOS)
        im.save('webflow/poster-' + name + '.webp', 'WEBP', quality=70, method=6)
        print('webflow/poster-' + name + '.webp', im.size)
        p.close()
    b.close()
