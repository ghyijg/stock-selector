@echo off
title 推送到 GitHub
cd /d "%~dp0"
echo 当前目录: %~dp0
echo.

echo 请先在 GitHub 新建一个空仓库（不要勾选 README），复制仓库地址。
echo 例如: https://github.com/你的用户名/stock-selector.git
echo.
set /p REPO=请粘贴仓库地址后回车: 

if "%REPO%"=="" (
    echo 未输入地址，已退出。
    pause
    exit /b 1
)

echo.
echo 正在添加远程并推送到 main...
git remote remove origin 2>nul
git remote add origin %REPO%
git branch -M main
git push -u origin main

if %errorlevel% equ 0 (
    echo.
    echo 推送成功。可到 https://vercel.com 用 GitHub 导入此仓库并部署。
) else (
    echo.
    echo 推送失败。若提示需要登录，请用 GitHub 个人访问令牌代替密码。
    echo 见 推送到GitHub.md 里的说明。
)
echo.
pause
