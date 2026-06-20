#!/bin/bash
set -e

echo "=== Nautilus Web Interface - Update ==="

cd "$(dirname "$0")"

echo "[1/4] Pulling latest code..."
git pull

echo "[2/4] Rebuilding Docker images..."
docker compose build --pull

echo "[3/4] Restarting containers..."
docker compose up -d

echo "[4/4] Cleaning up old images..."
docker image prune -f

echo "=== Update complete ==="
echo "Access the app at http://localhost:${NAUTILUS_WEB_PORT:-8080}"
