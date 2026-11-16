@echo off
title JOJO STAND RUSH - LAN server
pushd "%~dp0" >nul

where py >nul 2>nul
if %errorlevel%==0 (
  py server.py --host 0.0.0.0 --open
  goto :done
)

where python >nul 2>nul
if %errorlevel%==0 (
  python server.py --host 0.0.0.0 --open
  goto :done
)

echo Python was not found.
pause
exit /b 1

:done
popd >nul 2>&1
pause
