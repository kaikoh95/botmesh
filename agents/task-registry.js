/**
 * Task Registry — Scarlet's task tracking system.
 *
 * Every delegated task gets an ID. That ID travels with the task
 * through execution and returns with the result. Scarlet uses it
 * to route the outcome back to whoever originated the request.
 *
 * Task lifecycle:
 *   PENDING → IN_PROGRESS → DONE | FAILED
 *
 * Origin types:
 *   'kai'      → response goes to Telegram (KAI_CHAT_ID from env)
 *   'agent:X'  → response goes back to agent X via hub
 *   'cron'     → no response needed, just log
 */

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const REGISTRY_PATH = '/tmp/botmesh-tasks.json';

function load() {
  try { return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8')); }
  catch { return {}; }
}

function save(registry) {
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
}

/**
 * Create and register a new task.
 */
function createTask({ type, title, owner, brief, origin = 'cron' }) {
  const registry = load();
  const taskId = `task-${type}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  registry[taskId] = {
    taskId,
    type,
    title,
    owner,
    brief,
    origin,        // who to notify on completion: 'kai' | 'agent:iron' | 'cron'
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    result: null,
    error: null,
  };
  save(registry);
  return taskId;
}

/**
 * Mark a task in-progress.
 */
function startTask(taskId) {
  const registry = load();
  if (!registry[taskId]) return;
  registry[taskId].status = 'in_progress';
  registry[taskId].updatedAt = new Date().toISOString();
  save(registry);
}

/**
 * Complete a task with a result.
 */
function completeTask(taskId, result) {
  const registry = load();
  if (!registry[taskId]) return null;
  registry[taskId].status = 'done';
  registry[taskId].result = result;
  registry[taskId].updatedAt = new Date().toISOString();
  save(registry);
  return registry[taskId];
}

/**
 * Fail a task with an error.
 */
function failTask(taskId, error) {
  const registry = load();
  if (!registry[taskId]) return null;
  registry[taskId].status = 'failed';
  registry[taskId].error = error;
  registry[taskId].updatedAt = new Date().toISOString();
  save(registry);
  return registry[taskId];
}

/**
 * Get a task by ID.
 */
function getTask(taskId) {
  return load()[taskId] || null;
}

/**
 * Get all tasks with a given status.
 */
function getByStatus(status) {
  const registry = load();
  return Object.values(registry).filter(t => t.status === status);
}

/**
 * Purge tasks older than N hours.
 */
function purgeOld(hours = 24) {
  const registry = load();
  const cutoff = Date.now() - hours * 3600000;
  let pruned = 0;
  for (const [id, task] of Object.entries(registry)) {
    if (new Date(task.createdAt).getTime() < cutoff) {
      delete registry[id];
      pruned++;
    }
  }
  if (pruned) save(registry);
  return pruned;
}

module.exports = { createTask, startTask, completeTask, failTask, getTask, getByStatus, purgeOld };
