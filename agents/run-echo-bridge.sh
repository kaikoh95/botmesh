#!/usr/bin/env bash
set -euo pipefail
if [ -f /home/kai/projects/botmesh/.botmesh.env ]; then
  set -a
  source /home/kai/projects/botmesh/.botmesh.env
  set +a
fi
exec node /home/kai/projects/botmesh/agents/botmesh-echo-bridge.js
