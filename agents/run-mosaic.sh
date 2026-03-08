#!/bin/bash
# Mosaic periodic style review — runs every 2 hours
# Cronos manages this schedule.
export PATH="/home/kai/.nvm/versions/node/v24.14.0/bin:$PATH"
source /home/kai/projects/botmesh/.botmesh.env
node /home/kai/projects/botmesh/agents/botmesh-orchestrate.js --mode mosaic >> /tmp/cronos-mosaic.log 2>&1
