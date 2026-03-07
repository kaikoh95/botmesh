#!/bin/bash
source ~/.botmesh.env 2>/dev/null
export HUB_URL="${HUB_URL:-ws://localhost:3001}"
node /home/kai/projects/botmesh/agents/botmesh-qa.js
