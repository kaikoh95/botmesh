#!/bin/bash
export PATH="/home/kai/.nvm/versions/node/v24.14.0/bin:$PATH"
source /home/kai/projects/botmesh/.botmesh.env
node /home/kai/projects/botmesh/agents/botmesh-daily-report.js >> /tmp/daily-report.log 2>&1
