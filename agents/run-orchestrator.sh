#!/bin/bash
export GEMINI_API_KEY=$GEMINI_API_KEY
export HUB_URL=ws://localhost:3001
node /home/kai/projects/botmesh/agents/botmesh-orchestrate.js >> /tmp/botmesh-orchestrator.log 2>&1
