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

echo "== systemd service =="
sudo cp deploy/dropi-backend.service /etc/systemd/system/dropi-backend.service
sudo systemctl daemon-reload
sudo systemctl enable --now dropi-backend

echo "== Nginx =="
sudo cp deploy/nginx-dropi-manager.conf /etc/nginx/sites-available/dropi-manager
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
