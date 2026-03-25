# 🖥️ Remote Access Guide - VirtualBox & Genymotion

Panduan untuk mengakses VirtualBox dan Genymotion dari jarak jauh (remote access).

---

## ✅ **Prerequisites**

| Requirement | Status |
|-------------|--------|
| **VirtualBox** | ✅ Terinstall di Mac host |
| **Genymotion** | ✅ Terinstall di Mac host |
| **macOS** | ✅ Running di host machine |
| **Network** | Host harus accessible dari remote |

---

## 🔧 **Opsi 1: macOS Screen Sharing (VNC)**

### **Setup di Host (Mac dengan VirtualBox/Genymotion)**

1. **Enable Screen Sharing:**
   ```bash
   # Buka System Preferences → Sharing
   # Centang "Screen Sharing"
   ```

2. **Configure Access:**
   - System Preferences → Sharing → Screen Sharing
   - Klik "Computer Settings..."
   - Centang "VNC viewers may control screen with password"
   - Set password VNC

3. **Catat IP Address Host:**
   ```bash
   ipconfig getifaddr en0
   # atau untuk semua interface:
   ifconfig | grep "inet "
   ```

4. **Allow Firewall:**
   ```bash
   # System Preferences → Security & Privacy → Firewall
   # Allow Screen Sharing
   ```

### **Connect dari Remote Client**

**Dari Mac lain:**
```bash
# Finder → Go → Connect to Server
# Atau:
open vnc://IP_ADDRESS_HOST:5900
```

**Dari Windows:**
1. Download RealVNC Viewer: https://www.realvnc.com/
2. Connect ke: `IP_ADDRESS_HOST:5900`
3. Masukkan password VNC

**Dari Linux:**
```bash
vinagre vnc://IP_ADDRESS_HOST:5900
# atau
xtightvncviewer IP_ADDRESS_HOST::5900
```

---

## 🔧 **Opsi 2: SSH + X11 Forwarding (Advanced)**

### **Setup SSH di Host**

1. **Enable SSH:**
   ```bash
   # System Preferences → Sharing
   # Centang "Remote Login"
   ```

2. **Configure SSH:**
   ```bash
   sudo systemsetup -setremotelogin on
   ```

### **Connect dengan X11 Forwarding**

**Dari Linux/Mac remote:**
```bash
ssh -X username@IP_ADDRESS_HOST
# Setelah connect:
open /Applications/Genymotion.app
```

**Dari Windows:**
1. Install Xming: https://sourceforge.net/projects/xming/
2. Install PuTTY
3. Configure PuTTY:
   - Connection → SSH → X11 → Enable X11 forwarding
   - Session: hostname = IP_ADDRESS_HOST
4. Connect dan jalankan Genymotion

---

## 🔧 **Opsi 3: Chrome Remote Desktop (Termudah)**

### **Setup di Host**

1. **Install Chrome Remote Desktop:**
   - Buka Chrome browser
   - Kunjungi: https://remotedesktop.google.com/
   - Klik "Download" untuk install host component
   - Setup PIN (minimal 6 digit)

2. **Configure:**
   - Beri nama komputer
   - Enable remote connections
   - Keep Chrome running

### **Connect dari Remote**

1. Buka browser di device manapun
2. Kunjungi: https://remotedesktop.google.com/
3. Login dengan Google account yang sama
4. Pilih komputer host
5. Masukkan PIN
6. Full desktop access termasuk VirtualBox & Genymotion

---

## 🔧 **Opsi 4: AnyDesk / TeamViewer**

### **AnyDesk Setup**

**Di Host:**
```bash
# Download dari: https://anydesk.com/
# Install dan buka AnyDesk
# Catat AnyDesk ID (9 digit)
# Setup unattended access password
```

**Connect dari Remote:**
1. Install AnyDesk di remote device
2. Masukkan AnyDesk ID host
3. Connect dengan password

### **TeamViewer Setup**

**Di Host:**
```bash
# Download dari: https://www.teamviewer.com/
# Install TeamViewer
# Setup Easy Access atau permanent password
# Catat TeamViewer ID
```

---

## 🎮 **Akses Genymotion via Remote**

Setelah remote connected ke Mac host:

### **1. Buka Genymotion**
```bash
open /Applications/Genymotion.app
```

### **2. Start Virtual Device**
- Pilih virtual device
- Klik tombol Start (▶️)

### **3. Verify Device IP**
```bash
# Device akan dapat IP di network virtual VirtualBox
# Biasanya: 192.168.56.101
/Users/user/Library/Android/sdk/platform-tools/adb devices
```

### **4. Connect ADB Remote (Optional)**

Jika ingin akses ADB dari remote machine ke device di host:

**Di Host:**
```bash
# Enable ADB server listening
/Users/user/Library/Android/sdk/platform-tools/adb kill-server
/Users/user/Library/Android/sdk/platform-tools/adb start-server
```

**Di Remote:**
```bash
# Connect ke ADB server di host
adb connect IP_HOST:5555

# Verify
adb devices
```

---

## 🌐 **Remote Access dari Luar Network (Internet)**

### **Opsi A: Port Forwarding (NOT Recommended untuk Production)**

⚠️ **Warning:** Membuka port ke internet memiliki risiko keamanan!

```bash
# Di router host, forward ports:
# VNC: 5900
# SSH: 22
# RDP: 3389 (jika pakai Windows)

# Gunakan Dynamic DNS jika IP tidak static
# Contoh: no-ip.com, duckdns.org
```

### **Opsi B: VPN (Recommended)**

**Setup WireGuard VPN:**

1. **Install WireGuard di Host:**
   ```bash
   brew install wireguard-tools
   ```

2. **Generate Keys:**
   ```bash
   wg genkey | tee privatekey | wg pubkey > publickey
   ```

3. **Configure Server:**
   ```bash
   # /usr/local/etc/wireguard/wg0.conf
   [Interface]
   PrivateKey = SERVER_PRIVATE_KEY
   Address = 10.0.0.1/24
   ListenPort = 51820
   
   [Peer]
   PublicKey = CLIENT_PUBLIC_KEY
   AllowedIPs = 10.0.0.2/32
   ```

4. **Connect dari Remote:**
   ```bash
   wg-quick up wg0
   ssh username@10.0.0.1
   ```

### **Opsi C: Tailscale (Paling Mudah & Aman)**

**Setup di Host:**
```bash
brew install tailscale
sudo tailscale up
# Follow URL untuk authenticate
```

**Setup di Remote:**
```bash
# Install Tailscale di device remote
# Login dengan account yang sama
# Akses menggunakan Tailscale IP
```

**Connect:**
```bash
# Dapatkan Tailscale IP dari host (contoh: 100.x.y.z)
ssh username@100.x.y.z
# atau
open vnc://100.x.y.z:5900
```

---

## 📊 **Comparison Table**

| Method | Ease | Security | Performance | Best For |
|--------|------|----------|-------------|----------|
| **Screen Sharing (VNC)** | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | Local network |
| **SSH + X11** | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | Advanced users |
| **Chrome Remote Desktop** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Quick setup |
| **AnyDesk/TeamViewer** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | Occasional use |
| **Tailscale + VNC** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Remote access aman |
| **VPN (WireGuard)** | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Full control |

---

## 🎯 **Recommended Setup**

### **Untuk Development (Local Network):**
```
macOS Screen Sharing (VNC)
- Enable di System Preferences → Sharing
- Connect: vnc://IP_HOST:5900
```

### **Untuk Remote Access (Internet):**
```
Tailscale + Screen Sharing
1. Install Tailscale di host & remote
2. Enable Screen Sharing di host
3. Connect via Tailscale IP
```

### **Untuk Quick Access:**
```
Chrome Remote Desktop
- Setup 5 menit
- Cross-platform
- Free untuk personal use
```

---

## 🐛 **Troubleshooting**

### **VNC Connection Refused**
```bash
# Check Screen Sharing enabled
sudo systemsetup -getscreensharing

# Enable jika needed
sudo /System/Library/CoreServices/RemoteManagement/ARDAgent.app/Contents/Resources/kickstart-activate -configure-access -on

# Restart service
sudo launchctl unload /System/Library/LaunchDaemons/com.apple.screensharing.plist
sudo launchctl load /System/Library/LaunchDaemons/com.apple.screensharing.plist
```

### **Lag/Performance Issues**
- Turunkan resolusi display di remote client
- Gunakan koneksi wired Ethernet (bukan WiFi)
- Close aplikasi lain di host
- Reduce color depth di VNC client

### **Genymotion Tidak Bisa Start via Remote**
- Pastikan VirtualBox punya permission untuk run headless
- Di VirtualBox: File → Preferences → Display → Enable 3D Acceleration
- Restart VirtualBox service jika perlu

### **ADB Tidak Detect Device**
```bash
# Restart ADB
adb kill-server
adb start-server
adb devices

# Check VirtualBox network adapter
# Harus di mode "Bridged Adapter" atau "Host-only"
```

---

## 🔒 **Security Best Practices**

1. **Jangan expose VNC/SSH langsung ke internet** tanpa VPN
2. **Gunakan strong passwords** untuk semua remote access
3. **Enable two-factor authentication** bila tersedia
4. **Gunakan VPN/Tailscale** untuk akses dari internet
5. **Monitor logs** untuk unauthorized access attempts
6. **Update software** secara berkala

---

## 📞 **Need Help?**

- **macOS Screen Sharing:** https://support.apple.com/guide/mac-help/mchlp1113/mac
- **Tailscale Docs:** https://tailscale.com/knowledge-base/
- **Chrome Remote Desktop:** https://remotedesktop.google.com/support/
- **VirtualBox Networking:** https://www.virtualbox.org/manual/ch06.html

---

**Last Updated:**March 11, 2026
**Status:** ✅ Ready for Remote Access
