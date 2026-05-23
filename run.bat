@echo off
setlocal

echo Iniciando script BAT...

REM Abrir la aplicacion local (index.html) en el navegador externo
set "APP=%~dp0index.html"
if not exist "%APP%" (
  echo No se encontro el archivo: %APP%
  pause
  exit /b 1
)

REM 1) Intentar Edge
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
  start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" "%APP%"
  goto :ok
)
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
  start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" "%APP%"
  goto :ok
)

REM 2) Intentar Chrome
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%APP%"
  goto :ok
)
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "%APP%"
  goto :ok
)

REM 3) Fallback: navegador predeterminado
start "" "%APP%"

echo.
echo Aplicacion abierta: %APP%
:ok
pause

endlocal
