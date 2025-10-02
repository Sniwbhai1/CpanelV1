#!/bin/bash

echo "🔧 Fixing libvirt network issues..."
echo "=================================="

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "❌ This script must be run as root or with sudo"
    echo "   Run: sudo ./fix-network.sh"
    exit 1
fi

echo "1. Checking libvirt service..."
if systemctl is-active --quiet libvirtd; then
    echo "✅ libvirtd is running"
else
    echo "⚠️  Starting libvirtd service..."
    systemctl start libvirtd
    systemctl enable libvirtd
fi

echo ""
echo "2. Checking for default network..."
if virsh net-list --all | grep -q "default"; then
    echo "✅ Default network exists"
    
    # Check if it's active
    if virsh net-list | grep -q "default.*active"; then
        echo "✅ Default network is active"
    else
        echo "⚠️  Starting default network..."
        virsh net-start default
        virsh net-autostart default
    fi
else
    echo "❌ Default network not found, creating it..."
    
    # Create default network XML
    cat > /tmp/default-network.xml << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<network>
  <name>default</name>
  <uuid>00000000-0000-0000-0000-000000000000</uuid>
  <forward mode='nat'/>
  <bridge name='virbr0' stp='on' delay='0'/>
  <mac address='52:54:00:00:00:00'/>
  <ip address='192.168.122.1' netmask='255.255.255.0'>
    <dhcp>
      <range start='192.168.122.2' end='192.168.122.254'/>
    </dhcp>
  </ip>
</network>
EOF
    
    # Define and start the network
    virsh net-define /tmp/default-network.xml
    virsh net-start default
    virsh net-autostart default
    
    # Clean up
    rm -f /tmp/default-network.xml
    
    echo "✅ Default network created and started"
fi

echo ""
echo "3. Verifying network status..."
virsh net-list --all

echo ""
echo "4. Checking firewall rules..."
if command -v ufw &> /dev/null; then
    echo "UFW detected, checking rules..."
    if ufw status | grep -q "192.168.122.0/24"; then
        echo "✅ Firewall rules for libvirt network exist"
    else
        echo "⚠️  Adding firewall rules for libvirt network..."
        ufw allow in on virbr0
        ufw allow out on virbr0
    fi
fi

echo ""
echo "5. Testing network connectivity..."
if ping -c 1 192.168.122.1 &> /dev/null; then
    echo "✅ Network bridge is responding"
else
    echo "⚠️  Network bridge not responding, restarting..."
    systemctl restart libvirtd
    sleep 2
    virsh net-start default
fi

echo ""
echo "🎉 Network fix completed!"
echo ""
echo "You can now try creating VMs again."
echo "If you still have issues, check:"
echo "- virsh net-list --all"
echo "- systemctl status libvirtd"
echo "- journalctl -u libvirtd"
