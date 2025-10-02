#!/bin/bash

echo "🔍 VPS Control Panel - VM Setup Test"
echo "===================================="

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then
    echo "⚠️  This script should be run with sudo for complete testing"
    echo "   Some tests may fail without root privileges"
fi

echo ""
echo "1. Checking virtualization support..."
if egrep -c '(vmx|svm)' /proc/cpuinfo > /dev/null; then
    echo "✅ CPU virtualization support detected"
    echo "   VT-x/AMD-V: $(egrep -c '(vmx|svm)' /proc/cpuinfo) features found"
else
    echo "❌ No CPU virtualization support detected"
    echo "   This system may not support hardware virtualization"
fi

echo ""
echo "2. Checking KVM/QEMU installation..."
if command -v qemu-system-x86_64 &> /dev/null; then
    echo "✅ QEMU is installed: $(qemu-system-x86_64 --version | head -1)"
else
    echo "❌ QEMU not found. Install with: sudo apt install qemu-kvm"
fi

if command -v virsh &> /dev/null; then
    echo "✅ libvirt is installed: $(virsh --version)"
else
    echo "❌ libvirt not found. Install with: sudo apt install libvirt-daemon-system"
fi

if command -v virt-install &> /dev/null; then
    echo "✅ virt-install is installed: $(virt-install --version)"
else
    echo "❌ virt-install not found. Install with: sudo apt install virtinst"
fi

echo ""
echo "3. Checking libvirt service..."
if systemctl is-active --quiet libvirtd; then
    echo "✅ libvirtd service is running"
else
    echo "❌ libvirtd service is not running"
    echo "   Start with: sudo systemctl start libvirtd"
fi

echo ""
echo "4. Checking user permissions..."
if groups | grep -q libvirt; then
    echo "✅ Current user is in libvirt group"
else
    echo "⚠️  Current user is not in libvirt group"
    echo "   Add with: sudo usermod -a -G libvirt $USER"
    echo "   Then logout and login again"
fi

echo ""
echo "5. Testing libvirt connection..."
if virsh list --all &> /dev/null; then
    echo "✅ libvirt connection successful"
    echo "   Current VMs: $(virsh list --all --name | wc -l)"
else
    echo "❌ Cannot connect to libvirt"
    echo "   Check permissions and service status"
fi

echo ""
echo "6. Checking required directories..."
LIBVIRT_DIR="/var/lib/libvirt"
if [ -d "$LIBVIRT_DIR" ]; then
    echo "✅ libvirt directory exists: $LIBVIRT_DIR"
    if [ -w "$LIBVIRT_DIR" ]; then
        echo "✅ libvirt directory is writable"
    else
        echo "⚠️  libvirt directory is not writable by current user"
    fi
else
    echo "❌ libvirt directory not found: $LIBVIRT_DIR"
fi

IMAGES_DIR="/var/lib/libvirt/images"
if [ -d "$IMAGES_DIR" ]; then
    echo "✅ VM images directory exists: $IMAGES_DIR"
    if [ -w "$IMAGES_DIR" ]; then
        echo "✅ VM images directory is writable"
    else
        echo "⚠️  VM images directory is not writable by current user"
    fi
else
    echo "❌ VM images directory not found: $IMAGES_DIR"
fi

echo ""
echo "7. Checking network configuration..."
if virsh net-list --all | grep -q default; then
    echo "✅ Default network is available"
    NET_STATUS=$(virsh net-list --all | grep default | awk '{print $2}')
    echo "   Default network status: $NET_STATUS"
else
    echo "❌ Default network not found"
    echo "   Create with: sudo virsh net-define /usr/share/libvirt/networks/default.xml"
fi

echo ""
echo "8. Testing VM creation prerequisites..."
if command -v qemu-img &> /dev/null; then
    echo "✅ qemu-img is available"
else
    echo "❌ qemu-img not found"
fi

if command -v genisoimage &> /dev/null; then
    echo "✅ genisoimage is available (for cloud-init)"
else
    echo "⚠️  genisoimage not found (needed for cloud-init)"
    echo "   Install with: sudo apt install genisoimage"
fi

if command -v wget &> /dev/null; then
    echo "✅ wget is available (for downloading cloud images)"
else
    echo "⚠️  wget not found (needed for cloud images)"
    echo "   Install with: sudo apt install wget"
fi

echo ""
echo "📋 Summary:"
echo "==========="

# Count issues
ISSUES=0

if ! egrep -c '(vmx|svm)' /proc/cpuinfo > /dev/null; then
    echo "❌ CPU virtualization support missing"
    ISSUES=$((ISSUES + 1))
fi

if ! command -v virsh &> /dev/null; then
    echo "❌ libvirt not installed"
    ISSUES=$((ISSUES + 1))
fi

if ! systemctl is-active --quiet libvirtd; then
    echo "❌ libvirtd service not running"
    ISSUES=$((ISSUES + 1))
fi

if ! virsh list --all &> /dev/null; then
    echo "❌ Cannot connect to libvirt"
    ISSUES=$((ISSUES + 1))
fi

if [ $ISSUES -eq 0 ]; then
    echo "🎉 All checks passed! VM management should work properly."
    echo ""
    echo "To create your first VM:"
    echo "1. Start the control panel: npm start"
    echo "2. Open http://localhost:8080"
    echo "3. Go to Virtual Machines section"
    echo "4. Click 'Create VM'"
else
    echo "⚠️  Found $ISSUES issue(s) that need to be resolved."
    echo ""
    echo "Quick fix commands:"
    echo "sudo apt update"
    echo "sudo apt install qemu-kvm libvirt-daemon-system libvirt-clients bridge-utils virtinst genisoimage wget"
    echo "sudo usermod -a -G libvirt $USER"
    echo "sudo systemctl start libvirtd"
    echo "sudo systemctl enable libvirtd"
    echo ""
    echo "After running these commands, logout and login again, then run this test again."
fi

echo ""
echo "🔧 For more help, check the README.md file or the control panel documentation."
