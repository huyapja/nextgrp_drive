#!/bin/bash

set -e

if [ -d "/home/frappe/frappe-bench/apps/frappe" ]; then
    echo "Bench already exists, skipping init"
    cd frappe-bench
    bench start
else
    echo "Creating new bench..."
    
    bench init --skip-redis-config-generation frappe-bench --version version-15
    
    cd frappe-bench
    
    # Use containers instead of localhost
    bench set-mariadb-host mariadb
    bench set-redis-cache-host redis:6379
    bench set-redis-queue-host redis:6379
    bench set-redis-socketio-host redis:6379
    
    # Remove redis, watch from Procfile
    sed -i '/redis/d' ./Procfile
    sed -i '/watch/d' ./Procfile
    
    bench get-app drive --branch main
    
    bench new-site drive.localhost \
    --force \
    --mariadb-root-password 123 \
    --admin-password admin \
    --no-mariadb-socket
    
    bench --site drive.localhost install-app drive
    bench --site drive.localhost set-config developer_mode 1
    bench --site drive.localhost clear-cache
    bench --site drive.localhost set-config mute_emails 1
    bench use drive.localhost
    
    # ============================================
    # Configure OnlyOffice Integration
    # ============================================
    echo "⚙️  Configuring OnlyOffice..."
    
    # Get Docker host IP
    DOCKER_HOST_IP=$(hostname -I | awk '{print $1}')
    echo "   Docker Host IP: $DOCKER_HOST_IP"
    
    # Update site_config.json with OnlyOffice settings
    bench --site drive.localhost set-config onlyoffice_url "http://onlyoffice"
    bench --site drive.localhost set-config onlyoffice_jwt_secret "drive-onlyoffice-secret-key-123"
    bench --site drive.localhost set-config onlyoffice_callback_url "http://${DOCKER_HOST_IP}:8000"
    
    echo "✅ OnlyOffice configured!"
    echo "   OnlyOffice URL: http://localhost:8089"
    echo "   Callback URL: http://${DOCKER_HOST_IP}:8000"
    
    # Copy onlyoffice.py integration file if exists
    if [ -f "/workspace/onlyoffice.py" ]; then
        echo "📦 Installing OnlyOffice integration..."
        cp /workspace/onlyoffice.py /home/frappe/frappe-bench/apps/drive/drive/api/onlyoffice.py
        echo "✅ OnlyOffice integration installed!"
    else
        echo "⚠️  onlyoffice.py not found in /workspace"
        echo "   Please copy it manually to apps/drive/drive/api/"
    fi
    
    bench start
fi