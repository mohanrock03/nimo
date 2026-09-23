#!/usr/bin/env sh
cd "$(dirname "$0")"
echo "Starting Nimo on http://localhost:8765  (Ctrl+C to stop)"
( sleep 1; (command -v xdg-open >/dev/null && xdg-open http://localhost:8765) || (command -v open >/dev/null && open http://localhost:8765) ) >/dev/null 2>&1 &
if command -v python3 >/dev/null; then python3 -m http.server 8765
elif command -v python >/dev/null; then python -m http.server 8765
else npx --yes http-server -p 8765 -c-1; fi
