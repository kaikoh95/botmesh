#!/bin/bash
export PATH="/home/kai/.nvm/versions/node/v24.14.0/bin:$PATH"
source /home/kai/projects/botmesh/.botmesh.env
export HUB_URL=ws://localhost:3001
node /home/kai/projects/botmesh/agents/botmesh-orchestrate.js
