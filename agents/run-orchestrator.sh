#!/bin/bash
export PATH="/home/kai/.nvm/versions/node/v24.14.0/bin:$PATH"
export GEMINI_API_KEY=$GEMINI_API_KEY
export HUB_URL=ws://localhost:3001
node /home/kai/projects/botmesh/agents/botmesh-orchestrate.js >> /tmp/botmesh-orchestrator.log 2>&1
