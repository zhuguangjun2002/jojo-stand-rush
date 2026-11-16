@echo off
title JOJO STAND RUSH - local server
cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel%==0 (
  py server.py --open
  goto :done
)

where python >nul 2>nul
if %errorlevel%==0 (
  python server.py --open
  goto :done
)

echo Python was not found.
pause
exit /b 1

:done
pause
