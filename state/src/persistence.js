const fs = require('fs');
const path = require('path');

const STATE_PATH = path.resolve(__dirname, '../../world/state.json');
const SEED_PATH = path.resolve(__dirname, '../../world/seed.json');
const TMP_PATH = STATE_PATH + '.tmp';

let writeTimer = null;
let pendingState = null;

function stateExists() {
  return fs.existsSync(STATE_PATH);
}

function initState() {
  if (!stateExists()) {
    const seed = fs.readFileSync(SEED_PATH, 'utf8');
    fs.writeFileSync(STATE_PATH, seed, 'utf8');
    console.log('[State] Initialized state.json from seed.json');
  }
}

function loadState() {
  initState();
  const raw = fs.readFileSync(STATE_PATH, 'utf8');
  return JSON.parse(raw);
}

function saveStateImmediate(state) {
  fs.writeFileSync(TMP_PATH, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(TMP_PATH, STATE_PATH);
}

function saveState(state) {
  pendingState = state;
  if (!writeTimer) {
    writeTimer = setTimeout(() => {
      writeTimer = null;
      if (pendingState) {
        saveStateImmediate(pendingState);
        pendingState = null;
      }
    }, 1000);
  }
}

module.exports = { loadState, saveState, initState, stateExists };
