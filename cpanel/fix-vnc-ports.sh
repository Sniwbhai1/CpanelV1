#!/bin/bash

echo "🔧 VNC Port Fix Script"
echo "====================="

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "⚠️  This script should be run with sudo for complete functionality"
fi

echo ""
echo "1. Checking VNC ports and VM status..."

# Get all VMs
echo "📋 Available VMs:"
virsh list --all

echo ""
echo "2. Checking VNC displays for each VM..."

# Get VNC info for each VM
for vm in $(virsh list --all --name | grep -v '^$'); do
    echo "🖥️  VM: $vm"
    
    # Get VNC display
    vnc_display=$(virsh vncdisplay "$vm" 2>/dev/null)
    if [ $? -eq 0 ] && [ -n "$vnc_display" ]; then
        echo "   VNC Display: $vnc_display"
        
        # Convert to port
        display_num=$(echo "$vnc_display" | sed 's/://')
        if [ "$display_num" = "0" ]; then
            port="5900"
        else
            port=$((5900 + display_num))
        fi
        echo "   Calculated Port: $port"
        
        # Check if port is listening
        if netstat -tlnp 2>/dev/null | grep -q ":$port "; then
            echo "   ✅ Port $port is listening"
        else
            echo "   ❌ Port $port is NOT listening"
        fi
    else
        echo "   ❌ No VNC display found"
    fi
    echo ""
done

echo "3. Checking all listening VNC ports..."
echo "📡 Listening VNC ports:"
netstat -tlnp 2>/dev/null | grep -E ":(59[0-9][0-9]|60[0-9][0-9])" || echo "   No VNC ports found"

echo ""
echo "4. Checking libvirt VNC configuration..."

# Check if VNC is enabled in libvirt config
if [ -f /etc/libvirt/qemu.conf ]; then
    echo "📄 Checking /etc/libvirt/qemu.conf for VNC settings:"
    grep -E "vnc|graphics" /etc/libvirt/qemu.conf | grep -v "^#" || echo "   No VNC settings found"
fi

echo ""
echo "5. Testing VNC connection..."

# Test VNC connection for running VMs
for vm in $(virsh list --name | grep -v '^$'); do
    echo "🧪 Testing VNC for VM: $vm"
    
    vnc_display=$(virsh vncdisplay "$vm" 2>/dev/null)
    if [ $? -eq 0 ] && [ -n "$vnc_display" ]; then
        display_num=$(echo "$vnc_display" | sed 's/://')
        if [ "$display_num" = "0" ]; then
            port="5900"
        else
            port=$((5900 + display_num))
        fi
        
        echo "   Testing port $port..."
        if timeout 3 bash -c "</dev/tcp/localhost/$port" 2>/dev/null; then
            echo "   ✅ VNC port $port is accessible"
        else
            echo "   ❌ VNC port $port is not accessible"
        fi
    fi
done

echo ""
echo "6. Recommendations:"

# Check if VNC is properly configured
vnc_configured=false
for vm in $(virsh list --name | grep -v '^$'); do
    if virsh vncdisplay "$vm" >/dev/null 2>&1; then
        vnc_configured=true
        break
    fi
done

if [ "$vnc_configured" = true ]; then
    echo "✅ VNC appears to be configured for at least one VM"
    echo ""
    echo "🔧 If VNC ports are not working:"
    echo "   1. Ensure VMs are running: virsh start <vm-name>"
    echo "   2. Check VNC is enabled in VM config"
    echo "   3. Verify firewall allows VNC ports (5900-5999)"
    echo "   4. Check libvirt logs: journalctl -u libvirtd"
else
    echo "❌ No VNC displays found for running VMs"
    echo ""
    echo "🔧 To enable VNC:"
    echo "   1. Edit VM configuration: virsh edit <vm-name>"
    echo "   2. Add graphics section with VNC"
    echo "   3. Restart the VM"
fi

echo ""
echo "📋 Quick Fix Commands:"
echo "   # Check VM status"
echo "   virsh list --all"
echo ""
echo "   # Start a VM"
echo "   virsh start <vm-name>"
echo ""
echo "   # Check VNC display"
echo "   virsh vncdisplay <vm-name>"
echo ""
echo "   # Check listening ports"
echo "   netstat -tlnp | grep 59"
echo ""
echo "   # Test VNC port"
echo "   telnet localhost 5900"
