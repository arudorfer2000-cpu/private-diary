@echo off
setlocal EnableDelayedExpansion
title Private Diary - publish to GitHub
cd /d "%~dp0"
set REPO=private-diary
echo.
echo ===============================================================
echo  Private Diary: publish the web app with GitHub (free)
echo ===============================================================
echo  This script will:
echo    1. check that Git and the GitHub tool are installed
echo    2. sign you in to GitHub (a browser window opens, you approve)
echo    3. create a PUBLIC repository named %REPO% in your account
echo    4. switch on GitHub Pages and upload the project
echo  Your diary is never uploaded. Only the app itself is.
echo ===============================================================
echo.
pause

echo %~dp0 | find /i "\Temp\" >nul
if not errorlevel 1 (
  echo.
  echo This folder is a temporary preview of the zip file.
  echo Close this window, right-click the zip file, choose Extract All,
  echo open the extracted diary-app folder and double-click this file there.
  pause
  exit /b 1
)

where git >nul 2>nul
if errorlevel 1 (
  echo Git is missing. Installing it now...
  winget install --id Git.Git -e --source winget
  echo.
  echo Git was installed. Please CLOSE this window and double-click the file again.
  pause
  exit /b 0
)
where gh >nul 2>nul
if errorlevel 1 (
  echo The GitHub tool is missing. Installing it now...
  winget install --id GitHub.cli -e --source winget
  echo.
  echo The GitHub tool was installed. Please CLOSE this window and double-click the file again.
  pause
  exit /b 0
)

gh auth status >nul 2>nul
if errorlevel 1 (
  echo.
  echo Sign in to GitHub. Choose: GitHub.com, HTTPS, Yes to authenticate Git, Login with a web browser.
  echo Copy the one-time code shown here into the browser page that opens.
  echo.
  gh auth login --web --git-protocol https
  if errorlevel 1 goto :fail
)

for /f "delims=" %%i in ('gh api user -q .login') do set OWNER=%%i
if "%OWNER%"=="" goto :fail
echo.
echo Signed in as %OWNER%.

git config user.name >nul 2>nul
if errorlevel 1 git config --global user.name "%OWNER%"
git config user.email >nul 2>nul
if errorlevel 1 git config --global user.email "%OWNER%@users.noreply.github.com"

if not exist ".git" (
  git init
  if errorlevel 1 goto :fail
)
git add .
git commit -m "Private Diary" >nul 2>nul
git branch -M main

gh repo view %OWNER%/%REPO% >nul 2>nul
if errorlevel 1 (
  echo Creating the repository %OWNER%/%REPO% ...
  gh repo create %REPO% --public --source=. --remote=origin
  if errorlevel 1 goto :fail
) else (
  echo The repository %OWNER%/%REPO% already exists, using it.
  git remote get-url origin >nul 2>nul
  if errorlevel 1 git remote add origin https://github.com/%OWNER%/%REPO%.git
)

echo Switching on GitHub Pages ...
gh api --method POST repos/%OWNER%/%REPO%/pages -f build_type=workflow >nul 2>nul
if errorlevel 1 (
  gh api --method PUT repos/%OWNER%/%REPO%/pages -f build_type=workflow
)

echo Uploading the project ...
git push -u origin main
if errorlevel 1 (
  echo.
  echo The repository already has other content. Replacing it with this project ...
  git push -u origin main --force
  if errorlevel 1 goto :fail
)

echo.
echo ===============================================================
echo  Uploaded. GitHub is now building the app (3 to 6 minutes).
echo  Your app will be at:
echo      https://%OWNER%.github.io/%REPO%/
echo ===============================================================
echo  Opening the build page. Wait until it shows a green check mark,
echo  then open the address above in Safari on your iPhone.
echo.
start "" "https://github.com/%OWNER%/%REPO%/actions"
echo %OWNER%> "%~dp0github-user.txt"
pause
exit /b 0

:fail
echo.
echo Something did not work. Please take a screenshot of this window and send it to Claude.
echo Nothing has been changed on your PC apart from files in this folder.
pause
exit /b 1
