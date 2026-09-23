@echo off
cd /d "%~dp0"
echo Starting Nimo on http://localhost:8765  (close this window to stop)
start "" "http://localhost:8765"
where python >nul 2>nul && (python -m http.server 8765 & goto :eof)
where py >nul 2>nul && (py -m http.server 8765 & goto :eof)
where npx >nul 2>nul && (npx --yes http-server -p 8765 -c-1 & goto :eof)
echo.
echo Python or Node.js is needed to run the local web server.
echo Install Python for free from https://www.python.org/downloads/ (tick "Add to PATH"), then run this again.
pause
