#!/bin/bash
export PATH="/home/kai/.nvm/versions/node/v24.14.0/bin:$PATH"
# Iron's security scan — runs hourly
source /home/kai/projects/botmesh/.botmesh.env
export HUB_URL="${HUB_URL:-ws://localhost:3001}"
node /home/kai/projects/botmesh/agents/botmesh-iron-scan.js >> /tmp/iron-scan.log 2>&1
