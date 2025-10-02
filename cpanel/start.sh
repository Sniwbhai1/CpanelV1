#!/bin/bash

# VPS Control Panel Startup Script
# This script helps you quickly deploy and start the VPS Control Panel

echo "🚀 VPS Control Panel Setup"
echo "=========================="

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first:"
    echo "   Ubuntu/Debian: sudo apt update && sudo apt install nodejs npm"
    echo "   CentOS/RHEL: sudo yum install nodejs npm"
    echo "   Or visit: https://nodejs.org/"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 14 ]; then
    echo "❌ Node.js version 14 or higher is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js $(node -v) detected"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo "✅ npm $(npm -v) detected"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✅ Dependencies installed successfully"

# Check for virtualization support
echo "🔍 Checking virtualization support..."
if command -v virsh &> /dev/null; then
    echo "✅ KVM/QEMU detected"
    VIRT_STATUS=$(virsh list --all 2>/dev/null && echo "available" || echo "not_available")
    if [ "$VIRT_STATUS" = "available" ]; then
        echo "✅ Virtualization is ready for VM management"
    else
        echo "⚠️  KVM/QEMU installed but may need configuration"
        echo "   Run: sudo usermod -a -G libvirt \$USER"
        echo "   Then logout and login again"
    fi
else
    echo "⚠️  KVM/QEMU not detected - VM management will not be available"
    echo "   To enable VM management, install:"
    echo "   sudo apt install qemu-kvm libvirt-daemon-system libvirt-clients bridge-utils virtinst"
fi

# Check if port 8080 is available
if lsof -i :8080 &> /dev/null; then
    echo "⚠️  Port 8080 is already in use. The application will try to use a different port."
    echo "   You can also set a custom port with: export PORT=8081 && npm start"
fi

# Create logs directory
mkdir -p logs

# Set proper permissions
chmod +x server.js

echo ""
echo "🎉 Setup completed successfully!"
echo ""
echo "To start the VPS Control Panel:"
echo "  npm start"
echo ""
echo "The control panel will be available at:"
echo "  http://localhost:8080"
echo "  http://your-server-ip:8080"
echo ""
echo "For production use, consider:"
echo "  - Installing PM2: npm install -g pm2"
echo "  - Setting up a reverse proxy with Nginx"
echo "  - Configuring SSL certificates"
echo "  - Setting up firewall rules"
echo ""
echo "📖 See README.md for detailed instructions"
echo ""

# Ask if user wants to start now
read -p "Do you want to start the control panel now? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🚀 Starting VPS Control Panel..."
    npm start
fi
