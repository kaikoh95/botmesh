#!/bin/bash
# Visual QA — Canvas checks kurokimachi.com is rendering correctly
# Runs every hour at :30, offset from other crons
export PATH="/home/kai/.nvm/versions/node/v24.14.0/bin:$PATH"
source /home/kai/projects/botmesh/.botmesh.env
node /home/kai/projects/botmesh/agents/botmesh-orchestrate.js --mode visual-qa >> /tmp/cronos-visual-qa.log 2>&1
