#!/bin/bash
source /home/kai/projects/botmesh/.botmesh.env
API_URL="${BOTMESH_API_URL:-http://localhost:3002}"
echo "window.BOTMESH_STATE_URL = '${API_URL}';" > /home/kai/projects/botmesh/ui/config.js
echo "[config] Generated config.js with API_URL=$API_URL"
