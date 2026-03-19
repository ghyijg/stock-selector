@echo off
start "Push" cmd /k "cd /d %~dp0 && push-to-github.bat"
