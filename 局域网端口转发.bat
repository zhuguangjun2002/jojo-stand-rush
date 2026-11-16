@echo off
setlocal
title JOJO STAND RUSH - WSL LAN port forward

net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Requesting administrator privileges...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

set "PORT=8080"
for /f "tokens=1" %%i in ('wsl.exe hostname -I 2^>nul') do set "WSLIP=%%i"

if "%WSLIP%"=="" (
  echo.
  echo Could not find the WSL IP.
  echo Start WSL and run the game server first, then run this again.
  echo.
  pause
  exit /b 1
)

echo.
echo WSL IP: %WSLIP%
echo Forwarding Windows port %PORT% to WSL %WSLIP%:%PORT% ...
echo.

netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=%PORT% >nul 2>&1
netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=%PORT% connectaddress=%WSLIP% connectport=%PORT%
if errorlevel 1 (
  echo Failed to add the port proxy rule.
  pause
  exit /b 1
)

netsh advfirewall firewall delete rule name="JOJO LAN %PORT%" >nul 2>&1
netsh advfirewall firewall add rule name="JOJO LAN %PORT%" dir=in action=allow protocol=TCP localport=%PORT% profile=private,public >nul
if errorlevel 1 (
  echo Warning: the firewall rule could not be added.
  echo Allow Python / TCP %PORT% in Windows Defender Firewall manually.
)

echo.
echo Done. Use one of these addresses from the second device:
powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.IPAddress -notlike '172.26.*' } | Select-Object -ExpandProperty IPAddress" 2>nul
echo.
echo Example: http://192.168.50.176:%PORT%/
echo.
echo Keep the WSL game server running. If WSL restarts, run this script again.
pause
