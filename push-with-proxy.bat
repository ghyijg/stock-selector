@echo off
cd /d "%~dp0"
title Push to GitHub (with proxy)

REM ========== Change this port if it does not work ==========
REM FlyShadow: try 1080 or 10809 (check Options in app)
REM Clash: 7890  |  V2rayN: 10809 or 1080
set PROXY_PORT=7890
REM ============================================================

echo.
echo Using proxy 127.0.0.1:%PROXY_PORT%
echo.

git config --global http.proxy http://127.0.0.1:%PROXY_PORT%
git config --global https.proxy http://127.0.0.1:%PROXY_PORT%

echo Adding remote and pushing to main...
git remote remove origin 2>nul
git remote add origin https://github.com/ghyijg/stock-selector.git
git branch -M main
git push -u origin main

echo.
if %errorlevel% equ 0 (
    echo Done. You can remove proxy later with:
    echo   git config --global --unset http.proxy
    echo   git config --global --unset https.proxy
) else (
    echo Failed. Try: open push-with-proxy.bat in Notepad, change 7890 to 10809 or 1080, save and run again.
)
echo.
pause
