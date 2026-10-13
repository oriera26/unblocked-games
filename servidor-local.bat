@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo   Cal tenir Node.js instal-lat per engegar el servidor local.
    echo   Baixa'l de https://nodejs.org/ i torna a provar.
    echo.
    pause
    exit /b 1
)

node "%~dp0tools\serve.mjs"

echo.
echo   El servidor s'ha aturat.
pause
