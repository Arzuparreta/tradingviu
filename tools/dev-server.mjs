import { spawn, execFileSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runDir = resolve(repoRoot, '.cache', 'dev-server');
const pidFile = resolve(runDir, 'pnpm-dev.pid');
const logFile = resolve(runDir, 'pnpm-dev.log');
const webPort = Number(readEnvValue('WEB_PORT') ?? 5187);
const apiPort = Number(readEnvValue('API_PORT') ?? 3101);

const command = process.argv[2] ?? 'status';

if (command === 'start') {
  await start();
} else if (command === 'stop') {
  stop();
} else if (command === 'restart') {
  stop();
  await waitForPortsClosed();
  await start();
} else if (command === 'status') {
  await status();
} else {
  console.error(`Unknown command: ${command}`);
  process.exitCode = 1;
}

async function start() {
  mkdirSync(runDir, { recursive: true });

  if (isRecordedProcessAlive()) {
    console.log(`tradingviu dev server already running (pid ${readPid()})`);
    await status();
    return;
  }

  if ((await isPortOpen(webPort)) || (await isPortOpen(apiPort))) {
    console.error(
      `Cannot start: port ${webPort} or ${apiPort} is already in use outside the recorded tradingviu dev server.`,
    );
    console.error('Run `pnpm dev:status` and stop the conflicting process first.');
    process.exitCode = 1;
    return;
  }

  run('docker', [
    'compose',
    '--env-file',
    '.env',
    '-f',
    'infra/docker-compose.yml',
    'up',
    '-d',
    'postgres',
    'redis',
    'minio',
    'meilisearch',
    'mailpit',
  ]);

  // Keep workspace links current before spawning long-lived Vite/Bun watchers.
  // Adding a package while the dev server is alive otherwise leaves the old
  // process unable to resolve the new workspace until a manual install/restart.
  run('pnpm', ['install', '--offline']);

  const logFd = openSync(logFile, 'a');
  const child = spawn('pnpm', ['dev'], {
    cwd: repoRoot,
    detached: true,
    env: process.env,
    stdio: ['ignore', logFd, logFd],
  });

  child.unref();
  closeSync(logFd);
  writeFileSync(pidFile, `${child.pid}\n`);
  console.log(`started tradingviu dev server (pid ${child.pid})`);
  console.log(`web: http://localhost:${webPort}`);
  console.log(`api: http://localhost:${apiPort}`);
  console.log(`log: ${logFile}`);
}

function stop() {
  const pid = readPid();
  if (pid === undefined) {
    console.log('tradingviu dev server is not recorded as running');
    return;
  }

  const processGroups = listDescendantProcessGroupIds(pid);
  for (const pgid of processGroups) {
    killProcessGroup(pgid);
  }

  for (const childPid of listDescendantProcessIds(pid).reverse()) {
    killProcess(childPid);
  }
  killProcess(pid);

  rmSync(pidFile, { force: true });
  console.log(`stopped tradingviu dev server (pid ${pid})`);
}

async function status() {
  const pid = readPid();
  const alive = isRecordedProcessAlive();
  const webOpen = await isPortOpen(webPort);
  const apiOpen = await isPortOpen(apiPort);

  console.log(`dev pid: ${pid ?? 'none'}${alive ? ' (running)' : pid ? ' (stale)' : ''}`);
  console.log(`web ${webPort}: ${webOpen ? 'listening' : 'down'}`);
  console.log(`api ${apiPort}: ${apiOpen ? 'listening' : 'down'}`);
  console.log(`infra:`);
  run('docker', ['compose', '--env-file', '.env', '-f', 'infra/docker-compose.yml', 'ps']);
}

function readEnvValue(key) {
  const envFile = resolve(repoRoot, '.env');
  if (!existsSync(envFile)) return undefined;

  const prefix = `${key}=`;
  const line = readFileSync(envFile, 'utf8')
    .split(/\r?\n/)
    .find((candidate) => candidate.startsWith(prefix));

  return line?.slice(prefix.length).trim() || undefined;
}

function readPid() {
  if (!existsSync(pidFile)) return undefined;
  const pid = Number(readFileSync(pidFile, 'utf8').trim());
  return Number.isInteger(pid) && pid > 0 ? pid : undefined;
}

function isRecordedProcessAlive() {
  const pid = readPid();
  if (pid === undefined) return false;

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function listDescendantProcessIds(rootPid) {
  const rows = listProcesses();
  const childrenByParent = new Map();
  for (const row of rows) {
    const children = childrenByParent.get(row.ppid) ?? [];
    children.push(row.pid);
    childrenByParent.set(row.ppid, children);
  }

  const descendants = [];
  const queue = [...(childrenByParent.get(rootPid) ?? [])];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    descendants.push(current);
    queue.push(...(childrenByParent.get(current) ?? []));
  }

  return descendants;
}

function listDescendantProcessGroupIds(rootPid) {
  const relevantPids = new Set([rootPid, ...listDescendantProcessIds(rootPid)]);
  const groups = new Set();
  for (const row of listProcesses()) {
    if (relevantPids.has(row.pid)) groups.add(row.pgid);
  }
  return [...groups].sort((a, b) => b - a);
}

function listProcesses() {
  const output = execFileSync('ps', ['-eo', 'pid=,ppid=,pgid='], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  return output
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const [pid, ppid, pgid] = line.trim().split(/\s+/).map(Number);
      return { pid, ppid, pgid };
    })
    .filter((row) => Number.isInteger(row.pid) && Number.isInteger(row.ppid) && Number.isInteger(row.pgid));
}

function killProcessGroup(pgid) {
  try {
    process.kill(-pgid, 'SIGTERM');
  } catch {
    // Process group may already be gone.
  }
}

function killProcess(pid) {
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // Process may already be gone.
  }
}

function isPortOpen(port) {
  return new Promise((resolvePort) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.setTimeout(500);
    socket.once('connect', () => {
      socket.destroy();
      resolvePort(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolvePort(false);
    });
    socket.once('error', () => {
      resolvePort(false);
    });
  });
}

async function waitForPortsClosed() {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const webOpen = await isPortOpen(webPort);
    const apiOpen = await isPortOpen(apiPort);
    if (!webOpen && !apiOpen) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
}

function run(bin, args) {
  execFileSync(bin, args, { cwd: repoRoot, stdio: 'inherit' });
}
