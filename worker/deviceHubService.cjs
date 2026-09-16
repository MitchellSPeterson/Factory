const { spawn } = require('node:child_process');
const { mkdir, readFile, writeFile, rm, stat } = require('node:fs/promises');
const { createHash } = require('node:crypto');
const { networkInterfaces, tmpdir } = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const port = Number(process.env.FACTORY_DEVICE_HUB_PORT || 3400);
const lock = path.join(tmpdir(), `factory-hub-${createHash('sha256').update(root).digest('hex').slice(0, 12)}`);
let pending;
let child;
let nextAttempt = 0;
let closing = false;

function deviceHubAddresses(requestHost) {
  const hosts = [];
  if (requestHost) {
    try { hosts.push(new URL(`http://${requestHost}`).hostname); } catch {}
  }
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses || []) {
      if (!address.internal && address.family === 'IPv4') hosts.push(address.address);
    }
  }
  hosts.push('127.0.0.1');
  return [...new Set(hosts)].map(host => `http://${host}:${port}`);
}
async function healthy() {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/devices`, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) return false;
    const body = await response.json();
    return Array.isArray(body.simulators) && Array.isArray(body.emulators);
  } catch { return false; }
}
async function launch() {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid device service port');
  if (await healthy()) return;
  if (closing) return;
  try { await mkdir(lock); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const owner = await readFile(path.join(lock, 'owner'), 'utf8').then(JSON.parse).catch(() => null);
    const createdAt = owner?.at ?? await stat(lock).then(info => info.mtimeMs).catch(() => Date.now());
    if (Date.now() - createdAt > 60000) await rm(lock, { recursive: true, force: true });
    throw new Error('Device service is starting');
  }
  await writeFile(path.join(lock, 'owner'), JSON.stringify({ pid: process.pid, at: Date.now() }));
  try {
    if (await healthy()) return;
    if (Date.now() < nextAttempt) throw new Error('Device service is recovering');
    nextAttempt = Date.now() + 10000;
    child = spawn('node', [path.join(root, 'node_modules/expo-device-hub/dist/server/cli.mjs'),
      '--host', '0.0.0.0', '--port', String(port), '--transport', 'webrtc',
      '--video-fps', '60', '--video-bitrate', '8000000', '--max-dimension', '1080'],
    { cwd: root, env: process.env, stdio: 'inherit' });
    let failure;
    const processForAttempt = child;
    child.once('error', error => { failure = error; });
    child.once('exit', () => { if (child === processForAttempt) child = undefined; });
    for (let attempt = 0; attempt < 30; attempt++) {
      if (failure) throw failure;
      if (closing) throw new Error('Device service is stopping');
      if (await healthy()) return;
      if (processForAttempt.exitCode !== null) throw new Error('Device service exited during startup');
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    processForAttempt.kill();
    throw new Error('Device service is taking longer to start; retrying automatically');
  } finally { await rm(lock, { recursive: true, force: true }); }
}
function ensureDeviceHub() {
  if (!pending) pending = launch().finally(() => { pending = undefined; });
  return pending;
}
function superviseDeviceHub() {
  let active = true;
  let timer;
  closing = false;
  const tick = async () => {
    try { await ensureDeviceHub(); }
    catch (error) { if (active) console.warn(`[Devices] ${error.message}`); }
    if (active) { timer = setTimeout(tick, 5000); timer.unref(); }
  };
  void tick();
  const stop = () => { active = false; closing = true; clearTimeout(timer); child?.kill(); };
  process.once('exit', stop);
  return () => { process.removeListener('exit', stop); stop(); };
}
module.exports = { ensureDeviceHub, superviseDeviceHub, deviceHubAddresses };
