#!/bin/bash
# One-time setup on a fresh Debian/Ubuntu VM (e.g. GCP e2-micro Always Free).
# Run as a user with sudo (not root). Usage: bash setup-vm.sh <github-repo-url>
set -euo pipefail

REPO_URL="${1:?Usage: bash setup-vm.sh <github-repo-url>}"

echo "== Installing system packages =="
sudo apt update
sudo apt install -y python3 python3-venv python3-pip nodejs npm nginx git

echo "== Cloning repo =="
cd ~
git clone "$REPO_URL" dropi-manager
cd dropi-manager

echo "== Backend: venv + deps =="
cd backend
python3 -m venv venv
./venv/bin/pip install --upgrade pip
./venv/bin/pip install -r requirements.txt
cd ..

echo "== Frontend: build static files =="
cd frontend
npm install
npm run build
cd ..

# Nginx (running as www-data) needs to be able to traverse into the home dir
# to reach frontend/dist — the home directory is 700 by default on Debian.
chmod o+x "$HOME"

echo "== systemd service =="
sed "s#__HOME__#$HOME#g; s#__USER__#$(whoami)#g" deploy/dropi-backend.service \
    | sudo tee /etc/systemd/system/dropi-backend.service > /dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now dropi-backend

echo "== Nginx =="
sed "s#__HOME__#$HOME#g" deploy/nginx-dropi-manager.conf \
    | sudo tee /etc/nginx/sites-available/dropi-manager > /dev/null
sudo ln -sf /etc/nginx/sites-available/dropi-manager /etc/nginx/sites-enabled/dropi-manager
sudo rm -f /etc/nginx/sites-enabled/default
echo ">> Edit /etc/nginx/sites-available/dropi-manager and replace YOUR_DOMAIN_OR_IP before continuing."
read -p "Press Enter once edited... "
sudo nginx -t
sudo systemctl restart nginx

echo "== Firewall (GCP: also open port 80 in a VPC firewall rule / 'http-server' tag) =="
sudo ufw allow 'Nginx Full' || true
sudo ufw allow OpenSSH || true

echo
echo "Done. Visit http://<VM-external-IP>/ — upload dropi.db manually, it is NOT in the repo:"
echo "  scp backend/dropi.db your-user@vm-ip:~/dropi-manager/backend/dropi.db"
echo "  sudo systemctl restart dropi-backend"
