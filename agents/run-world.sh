#!/bin/bash
# World maintenance — Forge discretion + Mosaic sprite check
# Runs every 30 minutes. Forge builds/upgrades/landscapes; Mosaic sprites missing art.
export PATH="/home/kai/.nvm/versions/node/v24.14.0/bin:$PATH"
source /home/kai/.botmesh.env
export HUB_URL=ws://localhost:3001
node /home/kai/projects/botmesh/agents/botmesh-orchestrate.js --mode world
