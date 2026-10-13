#!/bin/sh
# Prints the inline loader for Webflow, pinned to a pushed commit with its SRI hash.
# Usage (from the repo root):  sh tools/make-loader.sh [commit]
# Default: the last commit that changed the bundle, so the URL only changes when the code does.
# Paste the output inside <script></script> in Page settings > Custom code > Before </body> on each hero page.
# The loader adds the hosted script with async, so it never blocks the page's first paint.
set -e
F=webflow/woven-thread-hero.min.js
if [ -n "$1" ]; then C=$(git rev-parse "$1"); else C=$(git log -1 --format=%H -- "$F"); fi
H="sha384-$(git show "$C:$F" | openssl dgst -sha384 -binary | base64 | tr -d '\n')"
printf "(function(){var s=document.createElement('script');s.src='https://cdn.jsdelivr.net/gh/madewithpixels/Woven-Thread-Shader@%s/%s';s.integrity='%s';s.crossOrigin='anonymous';s.async=true;document.head.appendChild(s);})();\n" "$C" "$F" "$H"
