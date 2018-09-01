@echo off

set zip="C:\Program Files\7-Zip\7z.exe"
set dir=%~dp0
set target="%dir%publish\firefox\current.zip"

del "%dir%\manifest.json"
type "%dir%\manifest.firefox.json" > "%dir%\manifest.json"

del %target%
%zip% a -mx=9 -r %target% "%dir%*"^
 -x!".git*"^
 -x!"manifest.chrome.json"^
 -x!"manifest.firefox.json"^
 -x!"publish\"^
 -x!"raw\"^
 -x!"tests\"^
 -x!"webstore\"^
 -x!"*.md"^
 -x!"*.bat"

del "%dir%\manifest.json"
