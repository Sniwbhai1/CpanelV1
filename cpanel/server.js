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

async function createSimpleVM(name, memory, cpus, diskSize, vmPath) {
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

app.get('/api/vms/:vmName/console', (req, res) => {
  const { vmName } = req.params;
  
  // Get VNC connection info
  exec(`virsh vncdisplay ${vmName}`, (error, stdout, stderr) => {
    if (error) {
      res.status(500).json({ error: 'Failed to get console info' });
      return;
    }
    
    const vncDisplay = stdout.trim();
    res.json({ 
      vncDisplay,
      consoleUrl: `vnc://localhost:${vncDisplay}`,
      message: 'Console information retrieved'
    });
  });
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
