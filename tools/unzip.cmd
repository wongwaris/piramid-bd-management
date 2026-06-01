@echo off
setlocal
set "ZIP_FILE="
set "DEST_DIR="

:parse
if "%~1"=="" goto run
if "%~1"=="-d" (
  set "DEST_DIR=%~2"
  shift
  shift
  goto parse
)
if "%~1"=="-qo" (
  shift
  goto parse
)
if "%~1"=="-q" (
  shift
  goto parse
)
if "%~1"=="-o" (
  shift
  goto parse
)
if not defined ZIP_FILE set "ZIP_FILE=%~1"
shift
goto parse

:run
if not defined ZIP_FILE exit /b 2
if not defined DEST_DIR set "DEST_DIR=."
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '%ZIP_FILE%' -DestinationPath '%DEST_DIR%' -Force"
exit /b %ERRORLEVEL%
