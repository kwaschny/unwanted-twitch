@echo off

set dir=%~dp0

:: manifest.json
set neutral=manifest.json
set chrome=manifest.chrome.json
set firefox=manifest.firefox.json

if exist "%dir%\%neutral%" (

	if exist "%dir%\%firefox%" (
		rename "%dir%\%neutral%" "%chrome%"
	) else (
		rename "%dir%\%neutral%" "%firefox%"
	)

	echo Restored: %neutral%

)

:: scripts\background.js
set neutral=background.js
set chrome=background.chrome.js
set firefox=background.firefox.js

if exist "%dir%\scripts\%neutral%" (

	if exist "%dir%\scripts\%firefox%" (
		rename "%dir%\scripts\%neutral%" "%chrome%"
	) else (
		rename "%dir%\scripts\%neutral%" "%firefox%"
	)

	echo Restored: scripts\%neutral%

)

echo(
pause
