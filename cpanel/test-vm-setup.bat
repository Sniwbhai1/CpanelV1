@echo off
echo 🔍 VPS Control Panel - VM Setup Test
echo ====================================
echo.
echo ⚠️  Note: This is a Windows version of the test script.
echo    For full VM functionality, you need to run this on a Linux VPS
echo    with KVM/QEMU virtualization support.
echo.

echo 1. Checking if we're on a supported system...
echo    Current OS: %OS%
echo    Current Architecture: %PROCESSOR_ARCHITECTURE%

echo.
echo 2. Checking for WSL (Windows Subsystem for Linux)...
wsl --list --quiet 2>nul
if %errorlevel% equ 0 (
    echo ✅ WSL is available
    echo    You can run the Linux version of the control panel in WSL
    echo    Run: wsl ./test-vm-setup.sh
) else (
    echo ❌ WSL not found
    echo    For VM management, you need a Linux VPS with KVM/QEMU
)

echo.
echo 3. Checking Node.js installation...
node --version >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Node.js is installed: 
    node --version
) else (
    echo ❌ Node.js not found
    echo    Install from: https://nodejs.org/
)

echo.
echo 4. Checking npm installation...
npm --version >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ npm is installed: 
    npm --version
) else (
    echo ❌ npm not found
)

echo.
echo 📋 Summary:
echo ===========
echo.
echo For VM management features, you need:
echo 1. A Linux VPS (Ubuntu/CentOS/Debian recommended)
echo 2. KVM/QEMU virtualization support
echo 3. libvirt and virt-install packages
echo.
echo The control panel will work on Windows for:
echo - System monitoring
echo - File management  
echo - Service management
echo - Database management
echo - Backup functionality
echo.
echo But VM management requires Linux with virtualization support.
echo.
echo To test VM setup on your Linux VPS:
echo 1. Copy the test-vm-setup.sh file to your VPS
echo 2. Run: chmod +x test-vm-setup.sh
echo 3. Run: ./test-vm-setup.sh
echo.
pause
