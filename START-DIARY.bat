@echo off
title Private Diary - Expo
cd /d "%~dp0app"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install it first: winget install OpenJS.NodeJS.LTS
  pause
  exit /b 1
)
echo Checking packages, the first time this takes a few minutes...
call npm install
if errorlevel 1 (
  echo npm install failed. Send a screenshot of this window to Claude.
  pause
  exit /b 1
)
echo.
echo Scan the QR code below with the iPhone camera, it opens in Expo Go.
echo iPhone and PC must be on the same Wi-Fi.
echo.
call npx expo start
pause
