#!/bin/sh
# Prints the inline loader for Webflow, pinned to a pushed commit with its SRI hash.
# Usage (from the repo root):  sh tools/make-loader.sh [commit]   (default: HEAD)
# Register the output as an inline script (Webflow's limit is 2,000 characters) and apply it in the footer.
# The loader adds the hosted script with async, so it never blocks the page's first paint.
set -e
C=$(git rev-parse "${1:-HEAD}")
F=webflow/woven-thread-hero.min.js
H="sha384-$(git show "$C:$F" | openssl dgst -sha384 -binary | base64 | tr -d '\n')"
printf "(function(){var s=document.createElement('script');s.src='https://cdn.jsdelivr.net/gh/madewithpixels/Woven-Thread-Shader@%s/%s';s.integrity='%s';s.crossOrigin='anonymous';s.async=true;document.head.appendChild(s);})();\n" "$C" "$F" "$H"
