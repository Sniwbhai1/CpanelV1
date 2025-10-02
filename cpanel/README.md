# VPS Control Panel

A modern, web-based control panel for VPS management with a beautiful and intuitive interface. This control panel provides comprehensive server management capabilities including system monitoring, file management, service control, database management, and backup functionality.

## 🚀 Features

### 📊 System Monitoring Dashboard
- Real-time CPU, Memory, and Disk usage monitoring
- Interactive performance charts
- Running processes overview
- Network interface status
- Live updates via WebSocket

### 📁 File Manager
- Browse and navigate server directories
- Upload files with drag-and-drop support
- Create new folders
- Delete files and directories
- Download files directly
- Breadcrumb navigation

### ⚙️ Service Management
- View all running system services
- Start, stop, restart services
- Real-time service status monitoring
- Service descriptions and details

### 🗄️ Database Management
- MySQL/MariaDB database listing
- PostgreSQL database support
- Database type identification
- Easy database management interface

### 🖥️ Virtual Machine Management (Proxmox-like)
- **Create VMs** with customizable resources (CPU, Memory, Disk)
- **VM Templates** for quick deployment (Ubuntu, CentOS, Debian)
- **VM Control** - Start, Stop, Shutdown, Suspend, Resume
- **Resource Monitoring** - Real-time VM resource usage
- **VNC Console Access** - Direct VM console connection
- **VM Management** - Delete, clone, and configure VMs
- **System Resource Allocation** - Monitor available resources for VM creation
- **KVM/QEMU Integration** - Full virtualization support

### 💾 Backup & Restore
- Create file system backups
- Database backup functionality
- Customizable backup paths
- Automated backup scheduling (extensible)

### 📋 System Logs
- View system logs
- Authentication logs
- Error logs
- Real-time log monitoring

## 🛠️ Installation

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn
- Linux-based VPS (Ubuntu/CentOS/Debian recommended)
- Root or sudo access
- **For VM Management**: KVM/QEMU virtualization support

### Quick Setup

1. **Clone or download the project files to your VPS:**
   ```bash
   # If you have git installed
   git clone <repository-url> /opt/vps-cpanel
   cd /opt/vps-cpanel
   
   # Or simply copy the files to your desired directory
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the control panel:**
   ```bash
   npm start
   ```

4. **Access the control panel:**
   Open your web browser and navigate to:
   ```
   http://your-vps-ip:8080
   ```

### Production Setup

For production use, consider the following:

1. **Install PM2 for process management:**
   ```bash
   npm install -g pm2
   pm2 start server.js --name "vps-cpanel"
   pm2 startup
   pm2 save
   ```

2. **Set up a reverse proxy with Nginx:**
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;
       
       location / {
           proxy_pass http://localhost:8080;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

3. **Enable HTTPS with Let's Encrypt:**
   ```bash
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d your-domain.com
   ```

## 🔧 Configuration

### Environment Variables
You can customize the control panel using environment variables:

```bash
# Set custom port (default: 8080)
export PORT=8080

# Set upload file size limit (default: 100MB)
export MAX_FILE_SIZE=100MB

# Set rate limiting (default: 100 requests per 15 minutes)
export RATE_LIMIT=100
```

### Security Considerations

1. **Firewall Configuration:**
   ```bash
   # Allow only port 8080 (or your custom port)
   sudo ufw allow 8080
   sudo ufw enable
   ```

2. **Access Control:**
   - The control panel currently runs without authentication
   - For production use, implement authentication middleware
   - Consider IP whitelisting for additional security

3. **File Permissions:**
   ```bash
   # Ensure proper file permissions
   chmod 755 /opt/vps-cpanel
   chown -R www-data:www-data /opt/vps-cpanel
   ```

## 📖 Usage Guide

### Dashboard
- Monitor real-time system performance
- View CPU, memory, and disk usage
- Check running processes
- Monitor network status

### File Manager
- Navigate through server directories
- Upload files by clicking the "Upload" button
- Create new folders with "New Folder"
- Select multiple files with Ctrl+Click
- Delete selected files with the "Delete" button

### Services
- View all system services
- Control services with start/stop/restart buttons
- Monitor service status in real-time

### Databases
- View available databases
- Identify database types (MySQL/PostgreSQL)
- Access database management tools

### Virtual Machines
- **Create VMs**: Use templates or custom configurations
- **Monitor Resources**: View available CPU, memory, and disk space
- **Control VMs**: Start, stop, suspend, or resume virtual machines
- **Console Access**: Connect to VM console via VNC
- **Resource Management**: Allocate CPU cores, memory, and disk space
- **VM Templates**: Quick deployment with pre-configured settings

### Backup
- Create file system backups
- Backup databases
- Specify custom backup locations

## 🔒 Security Features

- **Rate Limiting:** Prevents abuse with request rate limiting
- **Helmet.js:** Security headers for protection against common vulnerabilities
- **CORS Protection:** Configurable cross-origin resource sharing
- **File Upload Limits:** Configurable file size and type restrictions
- **Input Validation:** Server-side validation for all inputs

## 🐛 Troubleshooting

### Common Issues

1. **Port 8080 already in use:**
   ```bash
   # Find process using port 8080
   sudo lsof -i :8080
   # Kill the process or use a different port
   export PORT=8081
   npm start
   ```

2. **Permission denied errors:**
   ```bash
   # Fix file permissions
   sudo chown -R $USER:$USER /opt/vps-cpanel
   chmod +x server.js
   ```

3. **Service management not working:**
   - Ensure you're running with appropriate permissions
   - Check if systemctl is available
   - Verify service names are correct

4. **Database connections failing:**
   - Ensure MySQL/PostgreSQL services are running
   - Check database user permissions
   - Verify connection strings

5. **VM management not working:**
   - Check if KVM/QEMU is installed: `sudo apt install qemu-kvm libvirt-daemon-system libvirt-clients bridge-utils`
   - Verify virtualization support: `egrep -c '(vmx|svm)' /proc/cpuinfo`
   - Add user to libvirt group: `sudo usermod -a -G libvirt $USER`
   - Check libvirt service: `sudo systemctl status libvirtd`
   - Install virt-install: `sudo apt install virtinst`

### Logs
Check the console output for detailed error messages:
```bash
# View real-time logs
pm2 logs vps-cpanel

# Or if running directly
npm start
```

## 🚀 Advanced Features

### Custom Extensions
The control panel is designed to be extensible. You can add:

- Custom monitoring plugins
- Additional database support
- Email notifications
- Automated backup scheduling
- User authentication system
- API endpoints for external integrations

### API Endpoints
The control panel exposes REST API endpoints:

- `GET /api/system` - System information
- `GET /api/processes` - Running processes
- `GET /api/files/*` - File operations
- `POST /api/files/upload` - File upload
- `GET /api/services` - Service management
- `POST /api/services/:service/:action` - Service control
- `GET /api/databases` - Database listing
- `POST /api/backup` - Create backups

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## ⚠️ Disclaimer

This control panel provides direct access to your server's system functions. Use with caution and ensure you understand the implications of each action. Always maintain proper backups and security measures.

## 📞 Support

For support and questions:
- Check the troubleshooting section
- Review the console logs
- Ensure all dependencies are properly installed
- Verify system permissions

---

**Happy Server Management! 🎉**
