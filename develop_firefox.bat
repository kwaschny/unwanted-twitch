@echo off

set dir=%~dp0

:: rename manifest.json
if exist "%dir%\manifest.firefox.json" (
	del "%dir%\manifest.json" >nul 2>&1
	rename "%dir%\manifest.firefox.json" "manifest.json"
)

:: rename scripts\background.js
if exist "%dir%\scripts\background.firefox.js" (
	del "%dir%\scripts\background.js" >nul 2>&1
	rename "%dir%\scripts\background.firefox.js" "background.js"
)

echo Extension ready to be loaded in Firefox.

echo(
pause
