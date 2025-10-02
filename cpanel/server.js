const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const si = require('systeminformation');
const fs = require('fs-extra');
const { exec, spawn } = require('child_process');
const multer = require('multer');
const { promisify } = require('util');
const execAsync = promisify(exec);

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 8080;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"]
    }
  }
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = req.body.path || '/tmp';
    fs.ensureDirSync(uploadPath);
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// System information endpoints
app.get('/api/system', async (req, res) => {
  try {
    const [cpu, memory, disk, network, os] = await Promise.all([
      si.cpu(),
      si.mem(),
      si.fsSize(),
      si.networkInterfaces(),
      si.osInfo()
    ]);
    
    res.json({
      cpu,
      memory,
      disk,
      network,
      os
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/processes', async (req, res) => {
  try {
    const processes = await si.processes();
    res.json(processes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// File management endpoints
app.get('/api/files/*', (req, res) => {
  const filePath = req.params[0];
  const fullPath = path.resolve(filePath);
  
  try {
    const stats = fs.statSync(fullPath);
    if (stats.isDirectory()) {
      const files = fs.readdirSync(fullPath).map(file => {
        const fileStats = fs.statSync(path.join(fullPath, file));
        return {
          name: file,
          isDirectory: fileStats.isDirectory(),
          size: fileStats.size,
          modified: fileStats.mtime
        };
      });
      res.json(files);
    } else {
      res.download(fullPath);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/files/upload', upload.single('file'), (req, res) => {
  res.json({ message: 'File uploaded successfully', file: req.file });
});

app.delete('/api/files/*', (req, res) => {
  const filePath = req.params[0];
  const fullPath = path.resolve(filePath);
  
  try {
    fs.removeSync(fullPath);
    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Service management endpoints
app.get('/api/services', (req, res) => {
  exec('systemctl list-units --type=service --state=running --no-pager', (error, stdout) => {
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    
    const services = stdout.split('\n')
      .filter(line => line.includes('.service'))
      .map(line => {
        const parts = line.trim().split(/\s+/);
        return {
          name: parts[0],
          load: parts[1],
          active: parts[2],
          sub: parts[3],
          description: parts.slice(4).join(' ')
        };
      });
    
    res.json(services);
  });
});

app.post('/api/services/:service/:action', (req, res) => {
  const { service, action } = req.params;
  const validActions = ['start', 'stop', 'restart', 'reload'];
  
  if (!validActions.includes(action)) {
    return res.status(400).json({ error: 'Invalid action' });
  }
  
  exec(`systemctl ${action} ${service}`, (error, stdout, stderr) => {
    if (error) {
      res.status(500).json({ error: stderr || error.message });
      return;
    }
    res.json({ message: `Service ${service} ${action}ed successfully` });
  });
});

// Database management endpoints
app.get('/api/databases', (req, res) => {
  // Check for MySQL/MariaDB
  exec('mysql -e "SHOW DATABASES;" 2>/dev/null', (mysqlError, mysqlStdout) => {
    if (!mysqlError) {
      const databases = mysqlStdout.split('\n')
        .filter(line => line && !line.includes('Database') && !line.includes('information_schema') && !line.includes('performance_schema'))
        .map(db => ({ name: db.trim(), type: 'MySQL' }));
      return res.json(databases);
    }
    
    // Check for PostgreSQL
    exec('psql -l 2>/dev/null', (pgError, pgStdout) => {
      if (!pgError) {
        const databases = pgStdout.split('\n')
          .filter(line => line.includes('|'))
          .slice(1, -1)
          .map(line => {
            const parts = line.split('|');
            return { name: parts[0].trim(), type: 'PostgreSQL' };
          });
        return res.json(databases);
      }
      
      res.json([]);
    });
  });
});

// Backup endpoints
app.post('/api/backup', (req, res) => {
  const { type, path: backupPath } = req.body;
  
  let command;
  switch (type) {
    case 'files':
      command = `tar -czf ${backupPath}/backup_$(date +%Y%m%d_%H%M%S).tar.gz ${req.body.source || '/home'}`;
      break;
    case 'database':
      command = `mysqldump --all-databases > ${backupPath}/db_backup_$(date +%Y%m%d_%H%M%S).sql`;
      break;
    default:
      return res.status(400).json({ error: 'Invalid backup type' });
  }
  
  exec(command, (error, stdout, stderr) => {
    if (error) {
      res.status(500).json({ error: stderr || error.message });
      return;
    }
    res.json({ message: 'Backup completed successfully' });
  });
});

// VM Management endpoints
app.get('/api/vms', async (req, res) => {
  try {
    // Check if KVM/QEMU is available
    const { stdout: vmsOutput } = await execAsync('virsh list --all --name 2>/dev/null || echo "KVM not available"');
    
    if (vmsOutput.includes('KVM not available')) {
      return res.json({ vms: [], virtualization: 'none' });
    }
    
    const vmNames = vmsOutput.trim().split('\n').filter(name => name);
    const vms = [];
    
    for (const vmName of vmNames) {
      try {
        const { stdout: vmInfo } = await execAsync(`virsh dominfo ${vmName}`);
        const { stdout: vmState } = await execAsync(`virsh domstate ${vmName}`);
        
        const vm = {
          name: vmName,
          state: vmState.trim(),
          info: vmInfo
        };
        
        // Get VM resource usage
        try {
          const { stdout: vmStats } = await execAsync(`virsh domstats ${vmName} --cpu --balloon --block --network 2>/dev/null || echo ""`);
          vm.stats = vmStats;
        } catch (e) {
          vm.stats = '';
        }
        
        vms.push(vm);
      } catch (e) {
        console.error(`Error getting info for VM ${vmName}:`, e.message);
      }
    }
    
    res.json({ vms, virtualization: 'kvm' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/vms/:vmName/:action', async (req, res) => {
  const { vmName, action } = req.params;
  const validActions = ['start', 'stop', 'shutdown', 'reboot', 'suspend', 'resume'];
  
  if (!validActions.includes(action)) {
    return res.status(400).json({ error: 'Invalid action' });
  }
  
  try {
    const command = `virsh ${action} ${vmName}`;
    const { stdout, stderr } = await execAsync(command);
    
    if (stderr && !stderr.includes('Domain') && !stderr.includes('started') && !stderr.includes('stopped')) {
      throw new Error(stderr);
    }
    
    res.json({ message: `VM ${vmName} ${action}ed successfully` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/vms/create', async (req, res) => {
  const { name, memory, cpus, diskSize, osType, network, template } = req.body;
  
  try {
    const vmPath = `/var/lib/libvirt/images/${name}.qcow2`;
    
    // Method 1: Try to create VM with cloud image (if available)
    try {
      await createVMWithCloudImage(name, memory, cpus, diskSize, vmPath);
    } catch (cloudError) {
      console.log('Cloud image method failed, trying simple method:', cloudError.message);
      // Method 2: Create simple VM without installation media
      await createSimpleVM(name, memory, cpus, diskSize, vmPath);
    }
    
    res.json({ message: `VM ${name} created successfully` });
  } catch (error) {
    console.error('VM creation error:', error);
    console.error('Error details:', {
      message: error.message,
      stdout: error.stdout,
      stderr: error.stderr
    });
    res.status(500).json({ 
      error: error.message,
      details: error.stderr || error.stdout || 'Unknown error'
    });
  }
});

async function createVMWithCloudImage(name, memory, cpus, diskSize, vmPath) {
  const cloudImagePath = `/var/lib/libvirt/images/cloud-images/`;
  
  // Ensure cloud images directory exists
  await execAsync(`mkdir -p ${cloudImagePath}`);
  
  // Check and start default network
  await ensureDefaultNetwork();
  
  // Download cloud image if not exists (Ubuntu 22.04 as default)
  const cloudImage = `${cloudImagePath}ubuntu-22.04-server-cloudimg-amd64.img`;
  if (!fs.existsSync(cloudImage)) {
    console.log('Downloading Ubuntu 22.04 cloud image...');
    await execAsync(`wget -O ${cloudImage} https://cloud-images.ubuntu.com/releases/22.04/release/ubuntu-22.04-server-cloudimg-amd64.img`);
  }
  
  // Create a copy of the cloud image for this VM
  await execAsync(`cp ${cloudImage} ${vmPath}`);
  
  // Resize the disk to the requested size
  await execAsync(`qemu-img resize ${vmPath} ${diskSize}G`);
  
  // Create cloud-init configuration
  const cloudInitDir = `/var/lib/libvirt/images/${name}-cloud-init`;
  await execAsync(`mkdir -p ${cloudInitDir}`);
  
  // Create user-data file
  const userData = `#cloud-config
users:
  - name: ubuntu
    sudo: ALL=(ALL) NOPASSWD:ALL
    groups: users, admin
    home: /home/ubuntu
    shell: /bin/bash
    lock_passwd: false
chpasswd:
  list: |
    ubuntu:ubuntu
  expire: false
package_update: true
packages:
  - qemu-guest-agent
runcmd:
  - systemctl enable qemu-guest-agent
  - systemctl start qemu-guest-agent
`;
  
  fs.writeFileSync(`${cloudInitDir}/user-data`, userData);
  
  // Create meta-data file
  const metaData = `instance-id: ${name}
local-hostname: ${name}
`;
  fs.writeFileSync(`${cloudInitDir}/meta-data`, metaData);
  
  // Create cloud-init ISO
  await execAsync(`genisoimage -output ${cloudInitDir}.iso -volid cidata -joliet -rock ${cloudInitDir}/user-data ${cloudInitDir}/meta-data`);
  
  // Create the VM
  const command = `virt-install --name ${name} --memory ${memory} --vcpus ${cpus} --disk path=${vmPath},format=qcow2 --disk path=${cloudInitDir}.iso,device=cdrom --network network=default --graphics vnc --noautoconsole --import --os-variant ubuntu22.04`;
  
  console.log(`Creating VM with cloud image: ${command}`);
  const { stdout, stderr } = await execAsync(command);
}

async function ensureDefaultNetwork() {
  try {
    // Check if default network exists
    const { stdout: networks } = await execAsync('virsh net-list --all');
    
    if (!networks.includes('default')) {
      console.log('Default network not found, creating it...');
      // Create default network
      const defaultNetworkXml = `<?xml version="1.0" encoding="UTF-8"?>
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
</network>`;
      
      const networkFile = '/tmp/default-network.xml';
      fs.writeFileSync(networkFile, defaultNetworkXml);
      await execAsync(`virsh net-define ${networkFile}`);
      await execAsync(`rm -f ${networkFile}`);
    }
    
    // Start the default network
    await execAsync('virsh net-start default');
    console.log('Default network is active');
    
  } catch (error) {
    console.log('Network setup error:', error.message);
    // Try alternative network setup
    try {
      await execAsync('virsh net-autostart default');
      await execAsync('virsh net-start default');
    } catch (altError) {
      console.log('Alternative network setup also failed:', altError.message);
      throw new Error('Failed to setup default network');
    }
  }
}

async function createSimpleVM(name, memory, cpus, diskSize, vmPath) {
  // Ensure default network is available
  await ensureDefaultNetwork();
  
  // Create a simple VM definition without installation media
  const vmXml = `<?xml version='1.0' encoding='utf-8'?>
<domain type='kvm'>
  <name>${name}</name>
  <memory unit='KiB'>${memory * 1024}</memory>
  <currentMemory unit='KiB'>${memory * 1024}</currentMemory>
  <vcpu placement='static'>${cpus}</vcpu>
  <os>
    <type arch='x86_64' machine='pc-q35-6.2'>hvm</type>
    <boot dev='hd'/>
  </os>
  <features>
    <acpi/>
    <apic/>
  </features>
  <cpu mode='host-passthrough' check='none'/>
  <clock offset='utc'/>
  <on_poweroff>destroy</on_poweroff>
  <on_reboot>restart</on_reboot>
  <on_crash>destroy</on_crash>
  <devices>
    <emulator>/usr/bin/qemu-system-x86_64</emulator>
    <disk type='file' device='disk'>
      <driver name='qemu' type='qcow2'/>
      <source file='${vmPath}'/>
      <target dev='vda' bus='virtio'/>
      <address type='pci' domain='0x0000' bus='0x04' slot='0x00' function='0x0'/>
    </disk>
    <interface type='network'>
      <mac address='52:54:00:${Math.random().toString(16).substr(2, 2)}:${Math.random().toString(16).substr(2, 2)}:${Math.random().toString(16).substr(2, 2)}'/>
      <source network='default'/>
      <model type='virtio'/>
      <address type='pci' domain='0x0000' bus='0x01' slot='0x00' function='0x0'/>
    </interface>
    <serial type='pty'>
      <target type='isa-serial' port='0'>
        <model name='isa-serial'/>
      </target>
    </serial>
    <console type='pty'>
      <target type='serial' port='0'/>
    </console>
    <graphics type='vnc' port='-1' autoport='yes' listen='0.0.0.0'>
      <listen type='address' address='0.0.0.0'/>
    </graphics>
    <video>
      <model type='qxl' ram='65536' vram='65536' vgamem='16384' heads='1' primary='yes'/>
      <address type='pci' domain='0x0000' bus='0x00' slot='0x01' function='0x0'/>
    </video>
  </devices>
</domain>`;

  // Create the disk image
  await execAsync(`qemu-img create -f qcow2 ${vmPath} ${diskSize}G`);
  
  // Save VM definition to file
  const xmlFile = `/tmp/${name}.xml`;
  fs.writeFileSync(xmlFile, vmXml);
  
  // Define the VM
  await execAsync(`virsh define ${xmlFile}`);
  
  // Clean up
  await execAsync(`rm -f ${xmlFile}`);
  
  console.log(`Simple VM ${name} created successfully`);
}

app.delete('/api/vms/:vmName', async (req, res) => {
  const { vmName } = req.params;
  
  try {
    // Destroy VM if running
    await execAsync(`virsh destroy ${vmName} 2>/dev/null || true`);
    
    // Undefine VM
    await execAsync(`virsh undefine ${vmName}`);
    
    // Remove disk image
    const diskPath = `/var/lib/libvirt/images/${vmName}.qcow2`;
    await execAsync(`rm -f ${diskPath}`);
    
    res.json({ message: `VM ${vmName} deleted successfully` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/vms/:vmName/console', async (req, res) => {
  const { vmName } = req.params;
  
  try {
    // Get VNC connection info
    const { stdout: vncDisplay } = await execAsync(`virsh vncdisplay ${vmName}`);
    const display = vncDisplay.trim();
    
    // Extract port number
    const port = display.replace(':', '');
    
    // Get server IP address
    const { stdout: hostname } = await execAsync('hostname -I | awk \'{print $1}\'');
    const serverIP = hostname.trim();
    
    res.json({ 
      vncDisplay: display,
      vncPort: port,
      serverIP: serverIP,
      consoleUrl: `vnc://${serverIP}:${port}`,
      webConsoleUrl: `http://${serverIP}:${port}`,
      message: 'Console information retrieved'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get console info: ' + error.message });
  }
});

// Web VNC viewer endpoint
app.get('/vnc/:vmName', (req, res) => {
  const { vmName } = req.params;
  
  // Serve a simple VNC web viewer page
  const vncViewerHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>VM Console - ${vmName}</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            background: #1a1a1a;
            font-family: Arial, sans-serif;
            overflow: hidden;
        }
        .header {
            background: #2d2d2d;
            color: white;
            padding: 10px 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #444;
        }
        .vm-name {
            font-weight: bold;
            font-size: 18px;
        }
        .controls {
            display: flex;
            gap: 10px;
        }
        .btn {
            padding: 8px 16px;
            background: #667eea;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            text-decoration: none;
            font-size: 14px;
        }
        .btn:hover {
            background: #5a6fd8;
        }
        .vnc-container {
            width: 100vw;
            height: calc(100vh - 60px);
            background: #000;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
        }
        .vnc-info {
            text-align: center;
            padding: 20px;
            background: #2d2d2d;
            border-radius: 8px;
            border: 1px solid #444;
        }
        .vnc-info h3 {
            margin-top: 0;
            color: #667eea;
        }
        .connection-details {
            background: #1a1a1a;
            padding: 15px;
            border-radius: 4px;
            margin: 15px 0;
            font-family: monospace;
        }
        .status {
            padding: 10px;
            border-radius: 4px;
            margin: 10px 0;
        }
        .status.success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        .status.error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="vm-name">🖥️ VM Console: ${vmName}</div>
        <div class="controls">
            <button class="btn" onclick="refreshConnection()">🔄 Refresh</button>
            <a href="/" class="btn">🏠 Back to Control Panel</a>
        </div>
    </div>
    
    <div class="vnc-container">
        <div class="vnc-info">
            <h3>VM Console Access</h3>
            <div id="connection-status" class="status">
                <div>🔍 Checking VM status...</div>
            </div>
            <div class="connection-details">
                <div><strong>VM Name:</strong> ${vmName}</div>
                <div><strong>VNC Display:</strong> <span id="vnc-display">Loading...</span></div>
                <div><strong>Server IP:</strong> <span id="server-ip">Loading...</span></div>
                <div><strong>VNC Port:</strong> <span id="vnc-port">Loading...</span></div>
            </div>
            <div id="vnc-instructions">
                <h4>How to Connect:</h4>
                <p><strong>Option 1 - Web VNC (Recommended):</strong></p>
                <p>Click the "Open Web VNC" button below to access the console in your browser.</p>
                <p><strong>Option 2 - VNC Client:</strong></p>
                <p>Use a VNC client application and connect to: <span id="vnc-url">Loading...</span></p>
                <div style="margin-top: 20px;">
                    <button class="btn" onclick="openWebVNC()" id="web-vnc-btn" disabled>🌐 Open Web VNC</button>
                    <button class="btn" onclick="copyVNCUrl()">📋 Copy VNC URL</button>
                </div>
            </div>
        </div>
    </div>

    <script>
        let vncInfo = {};
        
        async function loadVNCInfo() {
            try {
                const response = await fetch('/api/vms/${vmName}/console');
                const data = await response.json();
                
                if (response.ok) {
                    vncInfo = data;
                    document.getElementById('vnc-display').textContent = data.vncDisplay;
                    document.getElementById('server-ip').textContent = data.serverIP;
                    document.getElementById('vnc-port').textContent = data.vncPort;
                    document.getElementById('vnc-url').textContent = data.consoleUrl;
                    
                    document.getElementById('connection-status').innerHTML = 
                        '<div class="status success">✅ VM Console is ready!</div>';
                    
                    document.getElementById('web-vnc-btn').disabled = false;
                    document.getElementById('web-vnc-btn').onclick = () => openWebVNC(data.webConsoleUrl);
                } else {
                    throw new Error(data.error || 'Failed to get console info');
                }
            } catch (error) {
                document.getElementById('connection-status').innerHTML = 
                    '<div class="status error">❌ Error: ' + error.message + '</div>';
            }
        }
        
        function openWebVNC(url) {
            if (url) {
                window.open(url, '_blank');
            } else if (vncInfo.webConsoleUrl) {
                window.open(vncInfo.webConsoleUrl, '_blank');
            }
        }
        
        function copyVNCUrl() {
            const url = vncInfo.consoleUrl || document.getElementById('vnc-url').textContent;
            navigator.clipboard.writeText(url).then(() => {
                alert('VNC URL copied to clipboard!');
            }).catch(() => {
                alert('Failed to copy URL. Please copy manually: ' + url);
            });
        }
        
        function refreshConnection() {
            loadVNCInfo();
        }
        
        // Load VNC info on page load
        loadVNCInfo();
        
        // Auto-refresh every 30 seconds
        setInterval(loadVNCInfo, 30000);
    </script>
</body>
</html>`;
  
  res.send(vncViewerHtml);
});

// VM Templates endpoint
app.get('/api/vm-templates', async (req, res) => {
  try {
    const templates = [
      {
        id: 'ubuntu-20.04',
        name: 'Ubuntu 20.04 LTS',
        description: 'Ubuntu 20.04 LTS Server',
        memory: 1024,
        cpus: 1,
        diskSize: 20,
        osType: 'linux'
      },
      {
        id: 'ubuntu-22.04',
        name: 'Ubuntu 22.04 LTS',
        description: 'Ubuntu 22.04 LTS Server',
        memory: 1024,
        cpus: 1,
        diskSize: 20,
        osType: 'linux'
      },
      {
        id: 'centos-8',
        name: 'CentOS 8',
        description: 'CentOS 8 Stream',
        memory: 1024,
        cpus: 1,
        diskSize: 20,
        osType: 'linux'
      },
      {
        id: 'debian-11',
        name: 'Debian 11',
        description: 'Debian 11 Bullseye',
        memory: 1024,
        cpus: 1,
        diskSize: 20,
        osType: 'linux'
      }
    ];
    
    res.json(templates);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// System resources for VM allocation
app.get('/api/system/resources', async (req, res) => {
  try {
    const [cpu, memory, disk] = await Promise.all([
      si.cpu(),
      si.mem(),
      si.fsSize()
    ]);
    
    const totalMemory = memory.total;
    const availableMemory = memory.available;
    const totalCores = cpu.cores;
    const totalDisk = disk.reduce((sum, d) => sum + d.size, 0);
    const availableDisk = disk.reduce((sum, d) => sum + (d.size - d.used), 0);
    
    res.json({
      memory: {
        total: totalMemory,
        available: availableMemory,
        used: totalMemory - availableMemory
      },
      cpu: {
        cores: totalCores,
        threads: cpu.physicalCores
      },
      disk: {
        total: totalDisk,
        available: availableDisk,
        used: totalDisk - availableDisk
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Network management endpoints
app.get('/api/networks', async (req, res) => {
  try {
    const { stdout: networksOutput } = await execAsync('virsh net-list --all');
    const networks = [];
    
    const lines = networksOutput.split('\n').slice(2); // Skip header lines
    for (const line of lines) {
      if (line.trim()) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3) {
          networks.push({
            name: parts[0],
            state: parts[1],
            autostart: parts[2],
            persistent: parts[3] || 'yes'
          });
        }
      }
    }
    
    res.json({ networks });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/networks/:networkName/:action', async (req, res) => {
  const { networkName, action } = req.params;
  const validActions = ['start', 'stop', 'destroy', 'autostart', 'undefine'];
  
  if (!validActions.includes(action)) {
    return res.status(400).json({ error: 'Invalid action' });
  }
  
  try {
    let command;
    if (action === 'autostart') {
      command = `virsh net-autostart ${networkName}`;
    } else {
      command = `virsh net-${action} ${networkName}`;
    }
    
    const { stdout, stderr } = await execAsync(command);
    res.json({ message: `Network ${networkName} ${action}ed successfully` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/networks/create-default', async (req, res) => {
  try {
    await ensureDefaultNetwork();
    res.json({ message: 'Default network created and started successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoint for VM setup
app.get('/api/debug/vm-setup', async (req, res) => {
  try {
    const debug = {
      timestamp: new Date().toISOString(),
      system: {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version
      },
      virtualization: {
        virsh: false,
        virtInstall: false,
        qemuImg: false,
        genisoimage: false,
        wget: false
      },
      permissions: {
        libvirtDir: false,
        imagesDir: false
      },
      services: {
        libvirtd: false
      }
    };
    
    // Check virtualization tools
    try {
      await execAsync('virsh --version');
      debug.virtualization.virsh = true;
    } catch (e) {
      debug.virtualization.virsh = false;
    }
    
    try {
      await execAsync('virt-install --version');
      debug.virtualization.virtInstall = true;
    } catch (e) {
      debug.virtualization.virtInstall = false;
    }
    
    try {
      await execAsync('qemu-img --version');
      debug.virtualization.qemuImg = true;
    } catch (e) {
      debug.virtualization.qemuImg = false;
    }
    
    try {
      await execAsync('genisoimage --version');
      debug.virtualization.genisoimage = true;
    } catch (e) {
      debug.virtualization.genisoimage = false;
    }
    
    try {
      await execAsync('wget --version');
      debug.virtualization.wget = true;
    } catch (e) {
      debug.virtualization.wget = false;
    }
    
    // Check permissions
    try {
      await execAsync('test -w /var/lib/libvirt');
      debug.permissions.libvirtDir = true;
    } catch (e) {
      debug.permissions.libvirtDir = false;
    }
    
    try {
      await execAsync('test -w /var/lib/libvirt/images');
      debug.permissions.imagesDir = true;
    } catch (e) {
      debug.permissions.imagesDir = false;
    }
    
    // Check services
    try {
      await execAsync('systemctl is-active libvirtd');
      debug.services.libvirtd = true;
    } catch (e) {
      debug.services.libvirtd = false;
    }
    
    res.json(debug);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// WebSocket connection for real-time updates
io.on('connection', (socket) => {
  console.log('Client connected');
  
  // Send system info every 5 seconds
  const interval = setInterval(async () => {
    try {
      const [cpu, memory, disk] = await Promise.all([
        si.currentLoad(),
        si.mem(),
        si.fsSize()
      ]);
      
      socket.emit('systemUpdate', {
        cpu: cpu.currentload,
        memory: {
          used: memory.used,
          total: memory.total,
          percentage: (memory.used / memory.total) * 100
        },
        disk: disk.map(d => ({
          fs: d.fs,
          used: d.used,
          total: d.size,
          percentage: (d.used / d.size) * 100
        }))
      });
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  }, 5000);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected');
    clearInterval(interval);
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error(error.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 VPS Control Panel running on http://localhost:${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}`);
  console.log(`🔧 System monitoring enabled`);
  console.log(`📁 File manager ready`);
  console.log(`⚙️  Service management active`);
});

module.exports = app;
