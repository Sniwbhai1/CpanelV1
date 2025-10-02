// Global variables
let socket;
let currentPath = '/';
let selectedFiles = [];
let performanceChart;
let systemData = {};
let vmTemplates = [];
let currentVmConsole = null;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeSocket();
    initializeNavigation();
    initializeDashboard();
    initializeFileManager();
    initializeServices();
    initializeDatabases();
    initializeVMs();
    initializeBackup();
    initializeLogs();
    initializeModals();
});

// Socket.IO connection
function initializeSocket() {
    socket = io();
    
    socket.on('connect', function() {
        console.log('Connected to server');
    });
    
    socket.on('systemUpdate', function(data) {
        updateSystemStats(data);
    });
    
    socket.on('error', function(error) {
        showAlert('error', error.message);
    });
    
    socket.on('disconnect', function() {
        console.log('Disconnected from server');
    });
}

// Navigation
function initializeNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const contentSections = document.querySelectorAll('.content-section');
    const pageTitle = document.getElementById('page-title');
    
    navItems.forEach(item => {
        item.addEventListener('click', function() {
            const section = this.getAttribute('data-section');
            
            // Update active nav item
            navItems.forEach(nav => nav.classList.remove('active'));
            this.classList.add('active');
            
            // Update active content section
            contentSections.forEach(section => section.classList.remove('active'));
            document.getElementById(section).classList.add('active');
            
            // Update page title
            pageTitle.textContent = this.querySelector('span').textContent;
            
            // Load section-specific data
            loadSectionData(section);
        });
    });
}

// Load data for specific sections
function loadSectionData(section) {
    switch(section) {
        case 'dashboard':
            loadSystemInfo();
            loadProcesses();
            break;
        case 'files':
            loadFiles(currentPath);
            break;
        case 'services':
            loadServices();
            break;
        case 'databases':
            loadDatabases();
            break;
        case 'vms':
            loadVMs();
            loadSystemResources();
            break;
        case 'logs':
            loadLogs();
            break;
    }
}

// Dashboard functionality
function initializeDashboard() {
    const refreshBtn = document.getElementById('refresh-btn');
    refreshBtn.addEventListener('click', function() {
        loadSystemInfo();
        loadProcesses();
    });
    
    // Initialize performance chart
    const ctx = document.getElementById('performance-chart').getContext('2d');
    performanceChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'CPU %',
                data: [],
                borderColor: '#667eea',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                tension: 0.4
            }, {
                label: 'Memory %',
                data: [],
                borderColor: '#4ecdc4',
                backgroundColor: 'rgba(78, 205, 196, 0.1)',
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                }
            }
        }
    });
}

function loadSystemInfo() {
    fetch('/api/system')
        .then(response => response.json())
        .then(data => {
            systemData = data;
            updateSystemDisplay(data);
        })
        .catch(error => {
            console.error('Error loading system info:', error);
            showAlert('error', 'Failed to load system information');
        });
}

function updateSystemDisplay(data) {
    // Update CPU info
    document.getElementById('cpu-usage').textContent = '0%';
    document.getElementById('cpu-progress').style.width = '0%';
    
    // Update Memory info
    const memoryPercent = (data.memory.used / data.memory.total) * 100;
    document.getElementById('memory-usage').textContent = `${memoryPercent.toFixed(1)}%`;
    document.getElementById('memory-progress').style.width = `${memoryPercent}%`;
    
    // Update Disk info
    if (data.disk && data.disk.length > 0) {
        const disk = data.disk[0];
        const diskPercent = (disk.used / disk.size) * 100;
        document.getElementById('disk-usage').textContent = `${diskPercent.toFixed(1)}%`;
        document.getElementById('disk-progress').style.width = `${diskPercent}%`;
    }
    
    // Update Network info
    document.getElementById('network-status').textContent = 'Active';
    document.getElementById('network-detail').textContent = `${data.network.length} interfaces`;
}

function updateSystemStats(data) {
    // Update real-time stats
    document.getElementById('cpu-usage').textContent = `${data.cpu.toFixed(1)}%`;
    document.getElementById('cpu-progress').style.width = `${data.cpu}%`;
    
    document.getElementById('memory-usage').textContent = `${data.memory.percentage.toFixed(1)}%`;
    document.getElementById('memory-progress').style.width = `${data.memory.percentage}%`;
    
    if (data.disk && data.disk.length > 0) {
        const disk = data.disk[0];
        document.getElementById('disk-usage').textContent = `${disk.percentage.toFixed(1)}%`;
        document.getElementById('disk-progress').style.width = `${disk.percentage}%`;
    }
    
    // Update chart
    const now = new Date().toLocaleTimeString();
    performanceChart.data.labels.push(now);
    performanceChart.data.datasets[0].data.push(data.cpu);
    performanceChart.data.datasets[1].data.push(data.memory.percentage);
    
    // Keep only last 20 data points
    if (performanceChart.data.labels.length > 20) {
        performanceChart.data.labels.shift();
        performanceChart.data.datasets[0].data.shift();
        performanceChart.data.datasets[1].data.shift();
    }
    
    performanceChart.update('none');
}

function loadProcesses() {
    fetch('/api/processes')
        .then(response => response.json())
        .then(data => {
            displayProcesses(data.list.slice(0, 10)); // Show top 10 processes
        })
        .catch(error => {
            console.error('Error loading processes:', error);
        });
}

function displayProcesses(processes) {
    const container = document.getElementById('processes-list');
    container.innerHTML = '';
    
    processes.forEach(process => {
        const processItem = document.createElement('div');
        processItem.className = 'process-item';
        processItem.innerHTML = `
            <div class="process-name">${process.name}</div>
            <div class="process-cpu">${process.cpu.toFixed(1)}%</div>
        `;
        container.appendChild(processItem);
    });
}

// File Manager functionality
function initializeFileManager() {
    const uploadBtn = document.getElementById('upload-btn');
    const newFolderBtn = document.getElementById('new-folder-btn');
    const deleteBtn = document.getElementById('delete-btn');
    
    uploadBtn.addEventListener('click', showUploadModal);
    newFolderBtn.addEventListener('click', showNewFolderModal);
    deleteBtn.addEventListener('click', deleteSelectedFiles);
    
    // Load initial files
    loadFiles('/');
}

function loadFiles(path) {
    currentPath = path;
    updateBreadcrumb(path);
    
    fetch(`/api/files/${path}`)
        .then(response => response.json())
        .then(data => {
            displayFiles(data);
        })
        .catch(error => {
            console.error('Error loading files:', error);
            showAlert('error', 'Failed to load files');
        });
}

function displayFiles(files) {
    const container = document.getElementById('file-list');
    container.innerHTML = '';
    
    // Add parent directory link
    if (currentPath !== '/') {
        const parentItem = document.createElement('div');
        parentItem.className = 'file-item';
        parentItem.innerHTML = `
            <div class="file-icon folder">
                <i class="fas fa-arrow-up"></i>
            </div>
            <div class="file-info">
                <div class="file-name">..</div>
                <div class="file-details">Parent directory</div>
            </div>
        `;
        parentItem.addEventListener('click', () => {
            const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
            loadFiles(parentPath);
        });
        container.appendChild(parentItem);
    }
    
    // Add files and directories
    files.forEach(file => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.innerHTML = `
            <div class="file-icon ${file.isDirectory ? 'folder' : 'file'}">
                <i class="fas fa-${file.isDirectory ? 'folder' : 'file'}"></i>
            </div>
            <div class="file-info">
                <div class="file-name">${file.name}</div>
                <div class="file-details">
                    ${file.isDirectory ? 'Directory' : formatFileSize(file.size)} • 
                    ${new Date(file.modified).toLocaleDateString()}
                </div>
            </div>
        `;
        
        fileItem.addEventListener('click', (e) => {
            if (e.ctrlKey || e.metaKey) {
                toggleFileSelection(fileItem, file);
            } else {
                if (file.isDirectory) {
                    loadFiles(path.join(currentPath, file.name));
                } else {
                    // Download file
                    window.open(`/api/files/${path.join(currentPath, file.name)}`);
                }
            }
        });
        
        container.appendChild(fileItem);
    });
}

function updateBreadcrumb(path) {
    const container = document.getElementById('path-breadcrumb');
    const parts = path.split('/').filter(part => part);
    
    container.innerHTML = '<span class="path-item active" data-path="/">/</span>';
    
    let currentPath = '';
    parts.forEach(part => {
        currentPath += '/' + part;
        const item = document.createElement('span');
        item.className = 'path-item';
        item.textContent = part;
        item.setAttribute('data-path', currentPath);
        item.addEventListener('click', () => loadFiles(currentPath));
        container.appendChild(item);
    });
}

function toggleFileSelection(fileItem, file) {
    if (fileItem.classList.contains('selected')) {
        fileItem.classList.remove('selected');
        selectedFiles = selectedFiles.filter(f => f.name !== file.name);
    } else {
        fileItem.classList.add('selected');
        selectedFiles.push(file);
    }
    
    updateDeleteButton();
}

function updateDeleteButton() {
    const deleteBtn = document.getElementById('delete-btn');
    deleteBtn.disabled = selectedFiles.length === 0;
}

function deleteSelectedFiles() {
    if (selectedFiles.length === 0) return;
    
    if (confirm(`Are you sure you want to delete ${selectedFiles.length} item(s)?`)) {
        const deletePromises = selectedFiles.map(file => {
            const filePath = path.join(currentPath, file.name);
            return fetch(`/api/files/${filePath}`, { method: 'DELETE' });
        });
        
        Promise.all(deletePromises)
            .then(() => {
                showAlert('success', 'Files deleted successfully');
                loadFiles(currentPath);
                selectedFiles = [];
                updateDeleteButton();
            })
            .catch(error => {
                showAlert('error', 'Failed to delete files');
            });
    }
}

// Services functionality
function initializeServices() {
    const refreshBtn = document.getElementById('refresh-services-btn');
    refreshBtn.addEventListener('click', loadServices);
}

function loadServices() {
    fetch('/api/services')
        .then(response => response.json())
        .then(data => {
            displayServices(data);
        })
        .catch(error => {
            console.error('Error loading services:', error);
            showAlert('error', 'Failed to load services');
        });
}

function displayServices(services) {
    const container = document.getElementById('services-list');
    container.innerHTML = '';
    
    services.forEach(service => {
        const serviceItem = document.createElement('div');
        serviceItem.className = 'service-item';
        serviceItem.innerHTML = `
            <div class="service-info">
                <div class="service-name">${service.name}</div>
                <div class="service-description">${service.description}</div>
            </div>
            <div class="service-status">
                <span class="status-badge status-${service.active}">${service.active}</span>
            </div>
            <div class="service-actions">
                <button class="btn btn-sm btn-primary" onclick="controlService('${service.name}', 'restart')">
                    <i class="fas fa-redo"></i>
                </button>
                <button class="btn btn-sm btn-${service.active === 'active' ? 'danger' : 'primary'}" 
                        onclick="controlService('${service.name}', '${service.active === 'active' ? 'stop' : 'start'}')">
                    <i class="fas fa-${service.active === 'active' ? 'stop' : 'play'}"></i>
                </button>
            </div>
        `;
        container.appendChild(serviceItem);
    });
}

function controlService(serviceName, action) {
    fetch(`/api/services/${serviceName}/${action}`, { method: 'POST' })
        .then(response => response.json())
        .then(data => {
            showAlert('success', data.message);
            loadServices();
        })
        .catch(error => {
            showAlert('error', 'Failed to control service');
        });
}

// Databases functionality
function initializeDatabases() {
    const refreshBtn = document.getElementById('refresh-databases-btn');
    refreshBtn.addEventListener('click', loadDatabases);
}

function loadDatabases() {
    fetch('/api/databases')
        .then(response => response.json())
        .then(data => {
            displayDatabases(data);
        })
        .catch(error => {
            console.error('Error loading databases:', error);
            showAlert('error', 'Failed to load databases');
        });
}

function displayDatabases(databases) {
    const container = document.getElementById('databases-list');
    container.innerHTML = '';
    
    if (databases.length === 0) {
        container.innerHTML = '<p>No databases found or database services not running.</p>';
        return;
    }
    
    databases.forEach(db => {
        const dbItem = document.createElement('div');
        dbItem.className = 'database-item';
        dbItem.innerHTML = `
            <div class="database-info">
                <div class="database-name">${db.name}</div>
                <div class="database-type">${db.type}</div>
            </div>
        `;
        container.appendChild(dbItem);
    });
}

// VM Management functionality
function initializeVMs() {
    const createVmBtn = document.getElementById('create-vm-btn');
    const refreshVmsBtn = document.getElementById('refresh-vms-btn');
    
    createVmBtn.addEventListener('click', showCreateVmModal);
    refreshVmsBtn.addEventListener('click', loadVMs);
    
    // Load VM templates
    loadVmTemplates();
}

function loadVMs() {
    fetch('/api/vms')
        .then(response => response.json())
        .then(data => {
            updateVirtualizationStatus(data.virtualization);
            displayVMs(data.vms);
        })
        .catch(error => {
            console.error('Error loading VMs:', error);
            showAlert('error', 'Failed to load VMs');
        });
}

function updateVirtualizationStatus(virtualization) {
    const statusElement = document.getElementById('virtualization-status');
    const statusDot = document.querySelector('.status-dot');
    
    switch(virtualization) {
        case 'kvm':
            statusElement.textContent = 'KVM/QEMU Available';
            statusDot.className = 'status-dot active';
            break;
        case 'none':
            statusElement.textContent = 'No Virtualization';
            statusDot.className = 'status-dot error';
            break;
        default:
            statusElement.textContent = 'Unknown';
            statusDot.className = 'status-dot warning';
    }
}

function displayVMs(vms) {
    const container = document.getElementById('vms-list');
    container.innerHTML = '';
    
    if (vms.length === 0) {
        container.innerHTML = `
            <div class="no-vms">
                <div class="no-vms-icon">
                    <i class="fas fa-desktop"></i>
                </div>
                <h3>No Virtual Machines</h3>
                <p>Create your first virtual machine to get started.</p>
                <button class="btn btn-primary" onclick="showCreateVmModal()">
                    <i class="fas fa-plus"></i> Create VM
                </button>
            </div>
        `;
        return;
    }
    
    vms.forEach(vm => {
        const vmItem = document.createElement('div');
        vmItem.className = 'vm-item';
        
        const stateClass = vm.state.toLowerCase();
        const stateIcon = getVmStateIcon(vm.state);
        
        vmItem.innerHTML = `
            <div class="vm-icon ${stateClass}">
                <i class="fas fa-${stateIcon}"></i>
            </div>
            <div class="vm-info">
                <div class="vm-name">${vm.name}</div>
                <div class="vm-details">
                    <div class="vm-detail-item">
                        <i class="fas fa-memory"></i>
                        <span>Memory: ${getVmMemory(vm.info)}</span>
                    </div>
                    <div class="vm-detail-item">
                        <i class="fas fa-microchip"></i>
                        <span>CPUs: ${getVmCpus(vm.info)}</span>
                    </div>
                    <div class="vm-detail-item">
                        <i class="fas fa-hdd"></i>
                        <span>Disk: ${getVmDisk(vm.info)}</span>
                    </div>
                </div>
                <div class="vm-status">
                    <span class="vm-status-badge vm-status-${stateClass}">${vm.state}</span>
                </div>
            </div>
            <div class="vm-actions">
                ${getVmActionButtons(vm.name, vm.state)}
            </div>
        `;
        
        container.appendChild(vmItem);
    });
}

function getVmStateIcon(state) {
    switch(state.toLowerCase()) {
        case 'running': return 'play';
        case 'shut off': return 'stop';
        case 'paused': return 'pause';
        default: return 'desktop';
    }
}

function getVmMemory(info) {
    const match = info.match(/Max memory:\s*(\d+)\s*kB/);
    if (match) {
        const memoryKB = parseInt(match[1]);
        return Math.round(memoryKB / 1024) + ' MB';
    }
    return 'Unknown';
}

function getVmCpus(info) {
    const match = info.match(/CPU\(s\):\s*(\d+)/);
    return match ? match[1] : 'Unknown';
}

function getVmDisk(info) {
    // This would need to be extracted from VM stats or disk info
    return 'Unknown';
}

function getVmActionButtons(vmName, state) {
    const buttons = [];
    
    if (state.toLowerCase() === 'running') {
        buttons.push(`<button class="vm-action-btn warning" onclick="controlVM('${vmName}', 'shutdown')">
            <i class="fas fa-power-off"></i> Shutdown
        </button>`);
        buttons.push(`<button class="vm-action-btn secondary" onclick="controlVM('${vmName}', 'suspend')">
            <i class="fas fa-pause"></i> Suspend
        </button>`);
        buttons.push(`<button class="vm-action-btn primary" onclick="openVmConsole('${vmName}')">
            <i class="fas fa-terminal"></i> Console
        </button>`);
    } else if (state.toLowerCase() === 'shut off') {
        buttons.push(`<button class="vm-action-btn success" onclick="controlVM('${vmName}', 'start')">
            <i class="fas fa-play"></i> Start
        </button>`);
    } else if (state.toLowerCase() === 'paused') {
        buttons.push(`<button class="vm-action-btn success" onclick="controlVM('${vmName}', 'resume')">
            <i class="fas fa-play"></i> Resume
        </button>`);
    }
    
    buttons.push(`<button class="vm-action-btn danger" onclick="deleteVM('${vmName}')">
        <i class="fas fa-trash"></i> Delete
    </button>`);
    
    return buttons.join('');
}

function controlVM(vmName, action) {
    fetch(`/api/vms/${vmName}/${action}`, { method: 'POST' })
        .then(response => response.json())
        .then(data => {
            showAlert('success', data.message);
            loadVMs();
        })
        .catch(error => {
            showAlert('error', 'Failed to control VM');
        });
}

function deleteVM(vmName) {
    if (confirm(`Are you sure you want to delete VM "${vmName}"? This action cannot be undone.`)) {
        fetch(`/api/vms/${vmName}`, { method: 'DELETE' })
            .then(response => response.json())
            .then(data => {
                showAlert('success', data.message);
                loadVMs();
            })
            .catch(error => {
                showAlert('error', 'Failed to delete VM');
            });
    }
}

function loadVmTemplates() {
    fetch('/api/vm-templates')
        .then(response => response.json())
        .then(templates => {
            vmTemplates = templates;
            populateTemplateSelect();
        })
        .catch(error => {
            console.error('Error loading VM templates:', error);
        });
}

function populateTemplateSelect() {
    const select = document.getElementById('vm-template');
    select.innerHTML = '<option value="">Select a template...</option>';
    
    vmTemplates.forEach(template => {
        const option = document.createElement('option');
        option.value = template.id;
        option.textContent = `${template.name} (${template.memory}MB RAM, ${template.cpus} CPU, ${template.diskSize}GB Disk)`;
        select.appendChild(option);
    });
}

function loadSystemResources() {
    fetch('/api/system/resources')
        .then(response => response.json())
        .then(data => {
            document.getElementById('available-cores').textContent = data.cpu.cores;
            document.getElementById('available-memory').textContent = formatBytes(data.memory.available);
            document.getElementById('available-disk').textContent = formatBytes(data.disk.available);
        })
        .catch(error => {
            console.error('Error loading system resources:', error);
        });
}

function showCreateVmModal() {
    document.getElementById('create-vm-modal').style.display = 'block';
}

function hideCreateVmModal() {
    document.getElementById('create-vm-modal').style.display = 'none';
}

function openVmConsole(vmName) {
    currentVmConsole = vmName;
    
    fetch(`/api/vms/${vmName}/console`)
        .then(response => response.json())
        .then(data => {
            document.getElementById('console-vm-name').textContent = vmName;
            document.getElementById('console-vnc-display').textContent = data.vncDisplay;
            document.getElementById('console-url').textContent = data.consoleUrl;
            
            // Use the web console URL from the server
            const webConsoleUrl = data.webConsoleUrl || `http://${data.serverIP}:${data.vncPort}`;
            const vncViewerUrl = `/vnc/${vmName}`;
            
            // Update web console link
            const webConsoleLink = document.getElementById('web-console-link');
            const webConsoleText = document.getElementById('web-console-text');
            
            webConsoleLink.href = vncViewerUrl;
            webConsoleText.textContent = `Open Web Console (${data.serverIP}:${data.vncPort})`;
            
            // Store the URL for copying
            webConsoleLink.dataset.url = webConsoleUrl;
            
            document.getElementById('vm-console-modal').style.display = 'block';
        })
        .catch(error => {
            showAlert('error', 'Failed to get console information');
        });
}

function hideVmConsoleModal() {
    document.getElementById('vm-console-modal').style.display = 'none';
    currentVmConsole = null;
}

function openWebConsole() {
    const webConsoleLink = document.getElementById('web-console-link');
    if (webConsoleLink.href && webConsoleLink.href !== '#') {
        window.open(webConsoleLink.href, '_blank');
    } else {
        showAlert('error', 'Web console URL not available');
    }
}

function openVncClient() {
    const url = document.getElementById('console-url').textContent;
    window.open(url, '_blank');
}

function copyConsoleLink() {
    const webConsoleLink = document.getElementById('web-console-link');
    const url = webConsoleLink.dataset.url || webConsoleLink.href;
    
    if (url && url !== '#') {
        navigator.clipboard.writeText(url).then(() => {
            showAlert('success', 'Console link copied to clipboard!');
        }).catch(() => {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = url;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            showAlert('success', 'Console link copied to clipboard!');
        });
    } else {
        showAlert('error', 'No console URL available to copy');
    }
}

// VM Creation Form
document.addEventListener('DOMContentLoaded', function() {
    const createVmForm = document.getElementById('create-vm-form');
    if (createVmForm) {
        createVmForm.addEventListener('submit', function(e) {
            e.preventDefault();
            createVM();
        });
    }
    
    // Template selection handler
    const templateSelect = document.getElementById('vm-template');
    if (templateSelect) {
        templateSelect.addEventListener('change', function() {
            const selectedTemplate = vmTemplates.find(t => t.id === this.value);
            if (selectedTemplate) {
                document.getElementById('vm-memory').value = selectedTemplate.memory;
                document.getElementById('vm-cpus').value = selectedTemplate.cpus;
                document.getElementById('vm-disk').value = selectedTemplate.diskSize;
                document.getElementById('vm-ostype').value = selectedTemplate.osType;
            }
        });
    }
});

function createVM() {
    const formData = {
        name: document.getElementById('vm-name').value,
        memory: parseInt(document.getElementById('vm-memory').value),
        cpus: parseInt(document.getElementById('vm-cpus').value),
        diskSize: parseInt(document.getElementById('vm-disk').value),
        osType: document.getElementById('vm-ostype').value,
        network: document.getElementById('vm-network').value
    };
    
    if (!formData.name) {
        showAlert('error', 'Please enter a VM name');
        return;
    }
    
    fetch('/api/vms/create', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
    })
    .then(response => response.json())
    .then(data => {
        showAlert('success', data.message);
        hideCreateVmModal();
        loadVMs();
        // Reset form
        document.getElementById('create-vm-form').reset();
    })
    .catch(error => {
        console.error('VM creation error:', error);
        let errorMessage = 'Failed to create VM';
        if (error.details) {
            errorMessage += ': ' + error.details;
        }
        showAlert('error', errorMessage);
    });
}

// Backup functionality
function initializeBackup() {
    const backupType = document.getElementById('backup-type');
    const sourceGroup = document.getElementById('source-group');
    const createBackupBtn = document.getElementById('create-backup-btn');
    
    backupType.addEventListener('change', function() {
        sourceGroup.style.display = this.value === 'files' ? 'block' : 'none';
    });
    
    createBackupBtn.addEventListener('click', createBackup);
}

function createBackup() {
    const type = document.getElementById('backup-type').value;
    const path = document.getElementById('backup-path').value;
    const source = document.getElementById('backup-source').value;
    
    const data = { type, path };
    if (type === 'files') {
        data.source = source;
    }
    
    fetch('/api/backup', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    })
    .then(response => response.json())
    .then(data => {
        showAlert('success', data.message);
    })
    .catch(error => {
        showAlert('error', 'Failed to create backup');
    });
}

// Logs functionality
function initializeLogs() {
    const refreshBtn = document.getElementById('refresh-logs-btn');
    refreshBtn.addEventListener('click', loadLogs);
}

function loadLogs() {
    const logType = document.getElementById('log-type').value;
    // This would typically fetch logs from the server
    // For now, we'll show a placeholder
    const container = document.getElementById('logs-content');
    container.innerHTML = `
        <div>Loading ${logType} logs...</div>
        <div>This feature requires additional server-side log parsing implementation.</div>
    `;
}

// Modal functionality
function initializeModals() {
    // Upload modal
    const uploadModal = document.getElementById('upload-modal');
    const uploadForm = document.getElementById('upload-form');
    
    document.getElementById('upload-btn').addEventListener('click', showUploadModal);
    document.querySelector('#upload-modal .close').addEventListener('click', hideUploadModal);
    
    uploadForm.addEventListener('submit', function(e) {
        e.preventDefault();
        uploadFile();
    });
    
    // Folder modal
    const folderModal = document.getElementById('folder-modal');
    const folderForm = document.getElementById('folder-form');
    
    document.getElementById('new-folder-btn').addEventListener('click', showNewFolderModal);
    document.querySelector('#folder-modal .close').addEventListener('click', hideNewFolderModal);
    
    folderForm.addEventListener('submit', function(e) {
        e.preventDefault();
        createFolder();
    });
    
    // VM Console modal
    document.querySelector('#vm-console-modal .close').addEventListener('click', hideVmConsoleModal);
    
    // Close modals when clicking outside
    window.addEventListener('click', function(e) {
        if (e.target.classList.contains('modal')) {
            e.target.style.display = 'none';
        }
    });
}

function showUploadModal() {
    document.getElementById('upload-path').value = currentPath;
    document.getElementById('upload-modal').style.display = 'block';
}

function hideUploadModal() {
    document.getElementById('upload-modal').style.display = 'none';
}

function showNewFolderModal() {
    document.getElementById('folder-path').value = currentPath;
    document.getElementById('folder-modal').style.display = 'block';
}

function hideNewFolderModal() {
    document.getElementById('folder-modal').style.display = 'none';
}

function uploadFile() {
    const fileInput = document.getElementById('file-input');
    const uploadPath = document.getElementById('upload-path').value;
    
    if (!fileInput.files[0]) {
        showAlert('error', 'Please select a file to upload');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    formData.append('path', uploadPath);
    
    fetch('/api/files/upload', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        showAlert('success', 'File uploaded successfully');
        hideUploadModal();
        loadFiles(currentPath);
    })
    .catch(error => {
        showAlert('error', 'Failed to upload file');
    });
}

function createFolder() {
    const folderName = document.getElementById('folder-name').value;
    const folderPath = document.getElementById('folder-path').value;
    
    if (!folderName) {
        showAlert('error', 'Please enter a folder name');
        return;
    }
    
    // This would typically make an API call to create the folder
    // For now, we'll show a success message
    showAlert('success', 'Folder creation feature requires additional server implementation');
    hideNewFolderModal();
}

// Utility functions
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatBytes(bytes) {
    return formatFileSize(bytes);
}

function showAlert(type, message) {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.textContent = message;
    
    const header = document.querySelector('.header');
    header.insertAdjacentElement('afterend', alertDiv);
    
    setTimeout(() => {
        alertDiv.remove();
    }, 5000);
}

// Path utility function
function path() {
    return {
        join: (...parts) => {
            return parts.filter(part => part).join('/').replace(/\/+/g, '/');
        }
    };
}
