@echo off
cd /d "%~dp0"
title Push to GitHub

echo.
echo Adding remote and pushing to main...
echo.

git remote remove origin 2>nul
git remote add origin https://github.com/ghyijg/stock-selector.git
git branch -M main
git push -u origin main

echo.
if %errorlevel% equ 0 (
    echo Done. Go to https://vercel.com to deploy.
) else (
    echo If login failed, use a Personal Access Token as password.
    echo Create token: https://github.com/settings/tokens
)
echo.
pause
