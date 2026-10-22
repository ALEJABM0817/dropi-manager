#!/bin/bash
# Run on the VM to deploy new changes after `git push`.
set -euo pipefail

cd ~/dropi-manager
git pull

cd backend
./venv/bin/pip install -r requirements.txt
cd ..

cd frontend
npm install
npm run build
cd ..

sudo systemctl restart dropi-backend
sudo systemctl reload nginx
echo "Deployed."
