#!/usr/bin/env bash
set -o errexit

pip install -r requirements.txt

# Check if npm is available (Render Python images may not have Node)
if ! command -v npm &> /dev/null; then
    echo "Installing Node.js..."
    pip install nodeenv
    nodeenv --prebuilt --node=20.11.0 -p
fi

# Build the frontend
cd ../ChessAI
npm install
npm run build

# Copy built frontend into backend's static directory
mkdir -p ../ChessAI-backend/static
cp -r dist/* ../ChessAI-backend/static/