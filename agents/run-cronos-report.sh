#!/bin/bash
# Cronos hourly world report — called by cron, not by Cronos agent directly
# (the Cronos agent handles its own hourly tick internally)
if [ -f ~/.botmesh.env ]; then source ~/.botmesh.env; fi
export HUB_URL="${HUB_URL:-ws://localhost:3001}"
node /home/kai/projects/botmesh/agents/botmesh-worker.js cronos \
  "The hour completes its cycle. All that was scheduled has been done." speak 2>/dev/null
