#!/usr/bin/env bash
set -o errexit

pip install -r requirements.txt

# Build the frontend and copy into backend's static dir
cd ../ChessAI
npm install
npm run build
mkdir -p ../ChessAI-backend/static
cp -r dist/* ../ChessAI-backend/static/