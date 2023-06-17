@echo off

set dir=%~dp0

:: rename manifest.json
if exist "%dir%\manifest.firefox.json" (
	del "%dir%\manifest.json" >nul 2>&1
	rename "%dir%\manifest.firefox.json" "manifest.json"
)

echo Extension ready to be loaded in Firefox.

echo(
pause
