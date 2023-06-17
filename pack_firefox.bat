@echo off

set zip="C:\Program Files\7-Zip\7z.exe"
set dir=%~dp0
set target="%dir%publish\firefox\current.zip"

:: swap manifest.json
del "%dir%\manifest.json"
type "%dir%\manifest.firefox.json" > "%dir%\manifest.json"

:: compress
del %target%
%zip% a -mx=9 -r %target% "%dir%*"^
 -x!".git*"^
 -x!"manifest.*.json"^
 -x!"publish\"^
 -x!"raw\"^
 -x!"tests\"^
 -x!"webstore\"^
 -x!"*.md"^
 -x!"*.bat"

:: clean up
del "%dir%\manifest.json"

pause
