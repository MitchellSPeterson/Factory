import { afterEach, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  mergeSimStreams,
  parseServeSimList,
  parseSimctlList,
  reconcileSimHub,
  resetSimHubBackoff,
  serveSimInvocation,
  type SimRunner,
} from "./simHub";

afterEach(() => resetSimHubBackoff());

const simctl = JSON.stringify({
  devices: {
    "com.apple.CoreSimulator.SimRuntime.iOS-18-4": [
      { udid: "AAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE", name: "iPhone 16 Pro", state: "Booted", isAvailable: true },
      { udid: "FFFF-BBBB-CCCC-DDDD-EEEEEEEEEEEE", name: "Unavailable", state: "Shutdown", isAvailable: false },
    ],
    "com.apple.CoreSimulator.SimRuntime.iOS-17-5": [
      { udid: "1111-BBBB-CCCC-DDDD-EEEEEEEEEEEE", name: "iPhone 15", state: "Shutdown", isAvailable: true },
    ],
  },
});

test("parseSimctlList keeps available devices and runtime labels", () => {
  const devices = parseSimctlList(`noise\n${simctl}`);
  expect(devices).toEqual([
    { udid: "AAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE", name: "iPhone 16 Pro", state: "booted", runtime: "iOS 18.4" },
    { udid: "1111-BBBB-CCCC-DDDD-EEEEEEEEEEEE", name: "iPhone 15", state: "shutdown", runtime: "iOS 17.5" },
  ]);
});

test("parseServeSimList fills stream URLs from port or explicit fields", () => {
  expect(parseServeSimList(JSON.stringify({
    udid: "AAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE",
    device: "iPhone 16 Pro",
    port: 3100,
  }))).toEqual([{
    udid: "AAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE",
    name: "iPhone 16 Pro",
    state: "booted",
    previewUrl: "http://127.0.0.1:3100",
    streamUrl: "http://127.0.0.1:3100/stream.mjpeg",
    wsUrl: "ws://127.0.0.1:3100/ws",
  }]);
});

test("mergeSimStreams copies live URLs onto matching simctl devices", () => {
  const devices = parseSimctlList(simctl);
  const merged = mergeSimStreams(devices, parseServeSimList(JSON.stringify([{
    device: { udid: "AAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE", name: "iPhone 16 Pro" },
    streamUrl: "http://127.0.0.1:3100/helper/AAAA/stream.mjpeg",
    wsUrl: "ws://127.0.0.1:3100/helper/AAAA/ws",
  }])));
  expect(merged[0]?.streamUrl).toBe("http://127.0.0.1:3100/helper/AAAA/stream.mjpeg");
  expect(merged[1]?.streamUrl).toBeUndefined();
});

test("serve-sim uses SERVE_SIM_PATH when set", () => {
  expect(serveSimInvocation({ SERVE_SIM_PATH: "/opt/serve-sim" }, ["--list", "-q"])).toEqual({
    command: "/opt/serve-sim",
    args: ["--list", "-q"],
  });
  expect(serveSimInvocation({}, ["--kill"])).toEqual({
    command: "npx",
    args: ["--yes", "@expo/serve-sim", "--kill"],
  });
});

test("reconcileSimHub starts serve-sim when wanted and reports unsupported platforms", async () => {
  const calls: string[] = [];
  const runner: SimRunner = {
    platform: "darwin",
    tmpdir: await fs.mkdtemp(path.join(os.tmpdir(), "factory-sim-")),
    env: {},
    run: async (command, args) => {
      calls.push([command, ...args].join(" "));
      if (args.includes("list") && args.includes("devices")) return { code: 0, text: simctl };
      if (args.includes("--list")) return { code: 0, text: "[]" };
      if (args.includes("--detach")) return { code: 0, text: JSON.stringify({ pid: 1, port: 3100 }) };
      return { code: 0, text: "" };
    },
    startPersistent: (command, args) => {
      calls.push([command, ...args].join(" "));
    },
  };
  const first = await reconcileSimHub({ wanted: true, commands: [], runner, now: 1 });
  expect(first.hub.supported).toBe(true);
  expect(calls.some((item) => item.includes("--host 0.0.0.0") && item.includes("--codec mjpeg"))).toBe(true);
  expect(calls.some((item) => item.includes("--detach"))).toBe(false);
  const linux = await reconcileSimHub({
    wanted: true,
    commands: [{ commandId: "1", command: { kind: "boot", udid: "AAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE" } }],
    runner: { ...runner, platform: "linux" },
  });
  expect(linux.hub.supported).toBe(false);
  expect(linux.results[0]?.error).toMatch(/macOS/);
});

test("boot commands call simctl and attach serve-sim", async () => {
  const calls: string[] = [];
  const runner: SimRunner = {
    platform: "darwin",
    tmpdir: await fs.mkdtemp(path.join(os.tmpdir(), "factory-sim-")),
    env: { SERVE_SIM_PATH: "serve-sim" },
    run: async (command, args) => {
      calls.push([command, ...args].join(" "));
      if (args[0] === "simctl" && args[1] === "list") return { code: 0, text: simctl };
      return { code: 0, text: "[]" };
    },
  };
  const result = await reconcileSimHub({
    wanted: false,
    commands: [{ commandId: "boot-1", command: { kind: "boot", udid: "1111-BBBB-CCCC-DDDD-EEEEEEEEEEEE" } }],
    runner,
  });
  expect(result.results).toEqual([{ commandId: "boot-1" }]);
  expect(calls).toContain("xcrun simctl boot 1111-BBBB-CCCC-DDDD-EEEEEEEEEEEE");
  expect(calls.some((item) => item.includes("--detach"))).toBe(false);
});

test("boot attaches serve-sim only when preview is wanted", async () => {
  const calls: string[] = [];
  const runner: SimRunner = {
    platform: "darwin",
    tmpdir: await fs.mkdtemp(path.join(os.tmpdir(), "factory-sim-")),
    env: { SERVE_SIM_PATH: "serve-sim" },
    run: async (command, args) => {
      calls.push([command, ...args].join(" "));
      if (args[0] === "simctl" && args[1] === "list") return { code: 0, text: simctl };
      return { code: 0, text: "[]" };
    },
    startPersistent: (command, args) => {
      calls.push([command, ...args].join(" "));
    },
  };
  await reconcileSimHub({
    wanted: true,
    commands: [{ commandId: "boot-1", command: { kind: "boot", udid: "1111-BBBB-CCCC-DDDD-EEEEEEEEEEEE" } }],
    runner,
    now: 1,
  });
  expect(calls).toContain(
    "serve-sim -q --codec mjpeg --host 0.0.0.0 --mjpeg-fps 30 --mjpeg-quality 0.75 --max-dimension 1080",
  );
  const { startPersistent, ...detachedRunner } = runner;
  await reconcileSimHub({ wanted: true, commands: [], runner: detachedRunner, now: 8_002 });
  expect(calls).toContain(
    "serve-sim --detach -q --codec mjpeg --host 0.0.0.0 --mjpeg-fps 30 --mjpeg-quality 0.75 --max-dimension 1080",
  );
});
