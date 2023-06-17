@echo off

set dir=%~dp0

:: rename manifest.json
if exist "%dir%\manifest.chrome.json" (
	del "%dir%\manifest.json" >nul 2>&1
	rename "%dir%\manifest.chrome.json" "manifest.json"
)

echo Extension ready to be loaded in Chrome.

echo(
pause
