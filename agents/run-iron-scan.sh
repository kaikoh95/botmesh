#!/bin/bash
# Iron's security scan — runs hourly
if [ -f ~/.botmesh.env ]; then
  source ~/.botmesh.env
fi
export HUB_URL="${HUB_URL:-ws://localhost:3001}"
node /home/kai/projects/botmesh/agents/botmesh-iron-scan.js >> /tmp/iron-scan.log 2>&1
