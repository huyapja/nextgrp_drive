# Script to forward port from Windows to WSL2
# Run this in PowerShell as Administrator

$port = 8080
$wslIp = "172.22.163.122"

# Remove existing forwarding if any
Write-Host "Removing existing port forwarding..." -ForegroundColor Yellow
netsh interface portproxy delete v4tov4 listenport=$port listenaddress=0.0.0.0 2>$null

# Add new port forwarding
Write-Host "Adding port forwarding: 0.0.0.0:$port -> $wslIp:$port" -ForegroundColor Green
netsh interface portproxy add v4tov4 listenport=$port listenaddress=0.0.0.0 connectport=$port connectaddress=$wslIp

# Add firewall rule
Write-Host "Configuring Windows Firewall..." -ForegroundColor Green
netsh advfirewall firewall delete rule name="WSL2 Drive Port 8080" 2>$null
netsh advfirewall firewall add rule name="WSL2 Drive Port 8080" dir=in action=allow protocol=TCP localport=$port

# Show current forwarding rules
Write-Host "`nCurrent port forwarding rules:" -ForegroundColor Cyan
netsh interface portproxy show v4tov4

Write-Host "`n✅ Done! Now you can access from your phone using Windows IP address." -ForegroundColor Green
Write-Host "Find your Windows IP by running: ipconfig" -ForegroundColor Yellow
