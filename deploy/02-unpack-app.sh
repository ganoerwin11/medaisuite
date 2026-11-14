#!/bin/bash
set -e

sudo mkdir -p /opt/medai
sudo chown -R $(whoami):$(whoami) /opt/medai
unzip -o ~/medai-deploy.zip -d /opt/medai
rm ~/medai-deploy.zip

cd /opt/medai
npm install --omit=dev

echo "App unpacked and dependencies installed."
