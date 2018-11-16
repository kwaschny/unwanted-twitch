@echo off

set dir=%~dp0

:: rename manifest.json
if exist "%dir%\manifest.chrome.json" (
	del "%dir%\manifest.json" >nul 2>&1
	rename "%dir%\manifest.chrome.json" "manifest.json"
)

:: rename scripts\background.js
if exist "%dir%\scripts\background.chrome.js" (
	del "%dir%\scripts\background.js" >nul 2>&1
	rename "%dir%\scripts\background.chrome.js" "background.js"
)

echo Extension ready to be loaded in Chrome.

echo(
pause
