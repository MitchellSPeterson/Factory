import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";

export type SimDeviceState = "booted" | "shutdown" | "creating" | "unknown";
export type SimDevice = {
  udid: string;
  name: string;
  state: SimDeviceState;
  runtime?: string;
  previewUrl?: string;
  streamUrl?: string;
  wsUrl?: string;
};
export type SimHubReport = {
  checkedAt: number;
  supported: boolean;
  running: boolean;
  message?: string;
  devices: SimDevice[];
};
export type DeviceCommand =
  | { kind: "boot"; udid: string }
  | { kind: "shutdown"; udid: string }
  | { kind: "button"; udid: string; name: "home" };
export type CommandResult = { code: number; text: string } | null;
export type SimRunner = {
  platform: string;
  tmpdir: string;
  env: Record<string, string | undefined>;
  run: (command: string, args: string[], timeoutMs: number) => Promise<CommandResult>;
  startPersistent?: (command: string, args: string[]) => Promise<void> | void;
  stopPersistent?: () => void;
};

const MAX_DEVICES = 40;
let nextStartAt = 0;
let lastStartError: string | undefined;

export function resetSimHubBackoff() {
  nextStartAt = 0;
  lastStartError = undefined;
}

export function parseSimctlList(text: string): SimDevice[] {
  const json = extractJson(text);
  if (!json || typeof json !== "object" || !("devices" in json) || !json.devices || typeof json.devices !== "object") {
    return [];
  }
  const devices: SimDevice[] = [];
  for (const [runtimeKey, rows] of Object.entries(json.devices as Record<string, unknown>)) {
    if (!Array.isArray(rows)) continue;
    const runtime = runtimeLabel(runtimeKey);
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const item = row as Record<string, unknown>;
      if (item.isAvailable === false) continue;
      const udid = typeof item.udid === "string" ? item.udid : "";
      const name = typeof item.name === "string" ? item.name : "";
      if (udid === "" || name === "") continue;
      devices.push({ udid, name, state: deviceState(item.state), runtime });
      if (devices.length >= MAX_DEVICES) return devices;
    }
  }
  return devices;
}

export function parseServeSimList(text: string): SimDevice[] {
  const json = extractJson(text);
  if (json == null) return [];
  const rows = Array.isArray(json) ? json : [json];
  const devices: SimDevice[] = [];
  for (const row of rows) {
    const parsed = parseServeSimState(row);
    if (parsed) devices.push(parsed);
  }
  return devices;
}

export function parseServeSimState(value: unknown, fallbackUdid = ""): SimDevice | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const nested = row.device && typeof row.device === "object" ? row.device as Record<string, unknown> : null;
  const udid = stringField(row.udid) || stringField(nested?.udid) || fallbackUdid;
  const name = stringField(row.name) || stringField(nested?.name) || stringField(row.device) || udid;
  if (udid === "" && name === "") return null;
  const origin = httpOrigin(stringField(row.url) || stringField(row.origin), numberField(row.port));
  const streamUrl = stringField(row.streamUrl) || (origin ? `${origin}/stream.mjpeg` : "");
  const wsUrl = stringField(row.wsUrl) || (origin ? origin.replace(/^http/i, "ws") + "/ws" : "");
  const previewUrl = stringField(row.previewUrl) || stringField(row.url) || origin;
  return {
    udid: udid || name,
    name: name || udid,
    state: "booted",
    previewUrl: previewUrl || undefined,
    streamUrl: streamUrl || undefined,
    wsUrl: wsUrl || undefined,
  };
}

export function mergeSimStreams(devices: SimDevice[], streams: SimDevice[]): SimDevice[] {
  return devices.map((device) => {
    const stream = streams.find((item) => item.udid === device.udid) ?? streams.find((item) => item.name === device.name);
    if (!stream) return device;
    return {
      ...device,
      previewUrl: stream.previewUrl ?? device.previewUrl,
      streamUrl: stream.streamUrl ?? device.streamUrl,
      wsUrl: stream.wsUrl ?? device.wsUrl,
    };
  });
}

export function serveSimInvocation(env: Record<string, string | undefined>, args: string[]): { command: string; args: string[] } {
  const configured = env.SERVE_SIM_PATH?.trim();
  if (configured) return { command: configured, args };
  return { command: "npx", args: ["--yes", "@expo/serve-sim", ...args] };
}

export async function readServeSimStates(tmpdir: string): Promise<SimDevice[]> {
  const dir = path.join(tmpdir, "serve-sim");
  let files: string[] = [];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  const devices: SimDevice[] = [];
  for (const file of files) {
    if (!file.startsWith("server-") || !file.endsWith(".json")) continue;
    const udid = file.slice("server-".length, -".json".length);
    try {
      const parsed = parseServeSimState(JSON.parse(await fs.readFile(path.join(dir, file), "utf8")), udid);
      if (parsed) devices.push(parsed);
    } catch {
      // ignore malformed helper state
    }
  }
  return devices;
}

export async function reconcileSimHub(opts: {
  wanted: boolean;
  commands: Array<{ commandId: string; command: DeviceCommand }>;
  runner: SimRunner;
  now?: number;
}): Promise<{ hub: SimHubReport; results: Array<{ commandId: string; error?: string }> }> {
  const checkedAt = opts.now ?? Date.now();
  if (opts.runner.platform !== "darwin") {
    return {
      hub: {
        checkedAt,
        supported: false,
        running: false,
        message: "iOS Simulator preview needs macOS with Xcode.",
        devices: [],
      },
      results: opts.commands.map((command) => ({ commandId: command.commandId, error: "iOS Simulator preview needs macOS with Xcode." })),
    };
  }

  const results: Array<{ commandId: string; error?: string }> = [];
  for (const item of opts.commands) {
    const error = await runDeviceCommand(opts.runner, item.command, opts.wanted);
    results.push(error ? { commandId: item.commandId, error } : { commandId: item.commandId });
  }

  let startError: string | undefined;
  const streamsBefore = await listStreams(opts.runner);
  if (opts.wanted && streamsBefore.length === 0) {
    const now = opts.now ?? Date.now();
    if (now < nextStartAt) startError = lastStartError;
    else {
      startError = await startPreview(opts.runner);
      if (startError) {
        lastStartError = startError;
        nextStartAt = now + 30_000;
      } else {
        lastStartError = undefined;
        nextStartAt = now + 8_000;
      }
    }
  } else if (!opts.wanted && streamsBefore.length > 0) {
    opts.runner.stopPersistent?.();
    await runServeSim(opts.runner, ["--kill"], 20_000);
    lastStartError = undefined;
    nextStartAt = 0;
  }

  const simctl = await runSimctl(opts.runner, ["list", "devices", "available", "-j"], 15_000);
  const devices = parseSimctlList(simctl?.text ?? "");
  const streams = await listStreams(opts.runner);
  const merged = mergeSimStreams(devices, streams);
  const message = startError
    ?? (devices.length === 0
      ? (!simctl || simctl.code !== 0
        ? "Xcode command line tools are missing. Install Xcode, then run xcode-select --install."
        : "No simulators are installed. Add one in Xcode → Settings → Platforms.")
      : streams.length === 0 && opts.wanted
        ? "serve-sim did not publish a stream. Check Xcode and that a simulator is booted."
        : undefined);

  return {
    hub: {
      checkedAt,
      supported: true,
      running: streams.length > 0,
      message,
      devices: merged,
    },
    results,
  };
}

export async function collectCommand(
  command: string,
  args: string[],
  env: Record<string, string>,
  timeoutMs: number,
): Promise<CommandResult> {
  try {
    const proc = Bun.spawn([command, ...args], { env, stdout: "pipe", stderr: "pipe" });
    const text = Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]).then(([out, err]) => `${out}\n${err}`);
    const timed = await Promise.race([
      proc.exited.then(async (code) => ({ code, text: await text })),
      Bun.sleep(timeoutMs).then(() => null),
    ]);
    if (timed === null) {
      proc.kill();
      return null;
    }
    return timed;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return { code: 127, text: message };
  }
}

let persistentPreview: ReturnType<typeof Bun.spawn> | null = null;

function stopPersistentPreview() {
  if (!persistentPreview) return;
  persistentPreview.kill();
  persistentPreview = null;
}

export function defaultSimRunner(env: Record<string, string | undefined> = process.env): SimRunner {
  const processEnv = Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  return {
    platform: process.platform,
    tmpdir: os.tmpdir(),
    env,
    run: (command, args, timeoutMs) => collectCommand(command, args, processEnv, timeoutMs),
    startPersistent: (command, args) => {
      stopPersistentPreview();
      persistentPreview = Bun.spawn([command, ...args], {
        env: processEnv,
        stdout: "ignore",
        stderr: "ignore",
      });
    },
    stopPersistent: stopPersistentPreview,
  };
}

async function listStreams(runner: SimRunner): Promise<SimDevice[]> {
  const fromFiles = await readServeSimStates(runner.tmpdir);
  if (fromFiles.length > 0) return fromFiles;
  const listed = await runServeSim(runner, ["--list", "-q"], 20_000);
  if (!listed || listed.code !== 0) return [];
  return parseServeSimList(listed.text);
}

function serveSimLanArgs(): string[] {
  return [
    "-q",
    "--codec",
    "mjpeg",
    "--host",
    "0.0.0.0",
    "--mjpeg-fps",
    "30",
    "--mjpeg-quality",
    "0.75",
    "--max-dimension",
    "1080",
  ];
}

async function startPreview(runner: SimRunner): Promise<string | undefined> {
  const invocation = serveSimInvocation(runner.env, serveSimLanArgs());
  if (runner.startPersistent) {
    try {
      await runner.startPersistent(invocation.command, invocation.args);
      return undefined;
    } catch (error) {
      return error instanceof Error ? error.message : "serve-sim failed to start.";
    }
  }
  const started = await runServeSim(runner, ["--detach", ...serveSimLanArgs()], 120_000);
  if (!started) return "serve-sim timed out while starting.";
  if (started.code !== 0) {
    if (/not found|ENOENT|command not found/i.test(started.text)) {
      return "serve-sim is not installed. The worker runs `npx @expo/serve-sim` on this machine.";
    }
    return "serve-sim failed to start. Install Xcode and boot a simulator, then try again.";
  }
  return undefined;
}

async function runDeviceCommand(runner: SimRunner, command: DeviceCommand, wanted: boolean): Promise<string | undefined> {
  if (command.kind === "boot") {
    const result = await runSimctl(runner, ["boot", command.udid], 60_000);
    if (!result) return "Timed out while booting the simulator.";
    if (result.code !== 0 && !/already booted/i.test(result.text)) return "Could not boot this Device.";
    if (wanted) {
      runner.stopPersistent?.();
      await startPreview(runner);
    }
    return undefined;
  }
  if (command.kind === "shutdown") {
    await runServeSim(runner, ["--kill", command.udid], 20_000);
    const result = await runSimctl(runner, ["shutdown", command.udid], 30_000);
    if (!result) return "Timed out while shutting down the simulator.";
    if (result.code !== 0 && !/already|current state: shutdown/i.test(result.text)) return "Could not shut down this Device.";
    return undefined;
  }
  const result = await runServeSim(runner, ["button", command.name, "-d", command.udid], 10_000);
  if (!result || result.code !== 0) return "Could not press Home on this Device.";
  return undefined;
}

async function runSimctl(runner: SimRunner, args: string[], timeoutMs: number) {
  return runner.run("xcrun", ["simctl", ...args], timeoutMs);
}

async function runServeSim(runner: SimRunner, args: string[], timeoutMs: number) {
  const invocation = serveSimInvocation(runner.env, args);
  return runner.run(invocation.command, invocation.args, timeoutMs);
}

function deviceState(value: unknown): SimDeviceState {
  const text = typeof value === "string" ? value.toLowerCase() : "";
  if (text === "booted") return "booted";
  if (text === "shutdown") return "shutdown";
  if (text === "creating" || text === "shutting down") return "creating";
  return "unknown";
}

function runtimeLabel(key: string): string | undefined {
  const match = key.match(/SimRuntime\.([A-Za-z]+)-(\d+)-(\d+)/);
  if (!match) return undefined;
  return `${match[1]} ${match[2]}.${match[3]}`;
}

function extractJson(text: string): unknown {
  const start = text.search(/[\[{]/);
  if (start < 0) return null;
  try {
    return JSON.parse(text.slice(start));
  } catch {
    return null;
  }
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberField(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function httpOrigin(url: string, port?: number): string {
  if (url !== "") {
    try {
      const parsed = new URL(url);
      return `${parsed.protocol}//${parsed.host}`;
    } catch {
      return url.replace(/\/+$/, "");
    }
  }
  if (port !== undefined) return `http://127.0.0.1:${port}`;
  return "";
}
