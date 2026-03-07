#!/bin/bash
# Ideas pipeline — Muse generates ideas when low, then executes next roadmap item
# Runs every 3 hours. Independent of world maintenance.
export PATH="/home/kai/.nvm/versions/node/v24.14.0/bin:$PATH"
source /home/kai/.botmesh.env
export HUB_URL=ws://localhost:3001
node /home/kai/projects/botmesh/agents/botmesh-orchestrate.js --mode ideas
