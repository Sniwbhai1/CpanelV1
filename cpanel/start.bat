@echo off
echo 🚀 VPS Control Panel Setup
echo ==========================

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed. Please install Node.js first:
    echo    Visit: https://nodejs.org/
    pause
    exit /b 1
)

echo ✅ Node.js detected

REM Check if npm is installed
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ npm is not installed. Please install npm first.
    pause
    exit /b 1
)

echo ✅ npm detected

REM Install dependencies
echo 📦 Installing dependencies...
npm install

if %errorlevel% neq 0 (
    echo ❌ Failed to install dependencies
    pause
    exit /b 1
)

echo ✅ Dependencies installed successfully

echo.
echo 🎉 Setup completed successfully!
echo.
echo To start the VPS Control Panel:
echo   npm start
echo.
echo The control panel will be available at:
echo   http://localhost:8080
echo.
echo 📖 See README.md for detailed instructions
echo.

REM Ask if user wants to start now
set /p start_now="Do you want to start the control panel now? (y/n): "
if /i "%start_now%"=="y" (
    echo 🚀 Starting VPS Control Panel...
    npm start
)

pause
