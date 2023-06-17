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

echo(
pause
