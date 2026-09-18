import { expect, test } from "bun:test";
import {
  applyCtrlModifier,
  chunkTerminalWrite,
  encodeTerminalPaste,
  hostPlatformFromOs,
  resolveModifiedTerminalInput,
  TERMINAL_WRITE_MAX_LENGTH,
} from "./terminalInput";

const byte = (code: number) => String.fromCharCode(code);
const ESC = byte(0x1b);
const CTRL_C = byte(0x03);
const CTRL_V = byte(0x16);

test("applyCtrlModifier maps letters and punctuation", () => {
  expect(applyCtrlModifier("c")).toBe(CTRL_C);
  expect(applyCtrlModifier("C")).toBe(CTRL_C);
  expect(applyCtrlModifier("z")).toBe(byte(0x1a));
  expect(applyCtrlModifier("[")).toBe(ESC);
  expect(applyCtrlModifier("?")).toBe(byte(0x7f));
  expect(applyCtrlModifier("1")).toBe("1");
  expect(applyCtrlModifier("")).toBe("");
});

test("resolveModifiedTerminalInput pastes on the host paste chord", () => {
  for (const hostPlatform of ["windows", "linux", "unknown"] as const) {
    expect(resolveModifiedTerminalInput({ data: "v", modifier: "ctrl", hostPlatform })).toEqual({
      kind: "paste",
    });
  }
  expect(
    resolveModifiedTerminalInput({ data: "v", modifier: "meta", hostPlatform: "windows" }),
  ).toEqual({ kind: "write", data: `${ESC}v` });
  expect(
    resolveModifiedTerminalInput({ data: "v", modifier: "meta", hostPlatform: "mac" }),
  ).toEqual({ kind: "paste" });
  expect(
    resolveModifiedTerminalInput({ data: "v", modifier: "ctrl", hostPlatform: "mac" }),
  ).toEqual({ kind: "write", data: CTRL_V });
  expect(
    resolveModifiedTerminalInput({ data: "c", modifier: "ctrl", hostPlatform: "windows" }),
  ).toEqual({ kind: "write", data: CTRL_C });
});

test("encodeTerminalPaste sanitizes clipboard text", () => {
  expect(encodeTerminalPaste("git switch -c fix/paste")).toBe("git switch -c fix/paste");
  expect(encodeTerminalPaste("one\ntwo\r\nthree\n")).toBe("one\rtwo\rthree\r");
  expect(encodeTerminalPaste(`a${byte(0)}b${ESC}c${byte(0x7f)}d\te`)).toBe("a b c d\te");
  expect(encodeTerminalPaste(`safe${ESC}[201~; rm -rf /\n`)).toBe("safe [201~; rm -rf /\r");
});

test("chunkTerminalWrite never splits a surrogate pair", () => {
  expect(chunkTerminalWrite("ls")).toEqual(["ls"]);
  const chunks = chunkTerminalWrite("y".repeat(TERMINAL_WRITE_MAX_LENGTH * 2 + 5));
  expect(chunks.map((chunk) => chunk.length)).toEqual([
    TERMINAL_WRITE_MAX_LENGTH,
    TERMINAL_WRITE_MAX_LENGTH,
    5,
  ]);
  const data = `${"z".repeat(TERMINAL_WRITE_MAX_LENGTH - 1)}😀tail`;
  const split = chunkTerminalWrite(data);
  expect(split[0]).toHaveLength(TERMINAL_WRITE_MAX_LENGTH - 1);
  expect(split[1]).toBe("😀tail");
  expect(split.join("")).toBe(data);
});

test("hostPlatformFromOs maps worker OS names", () => {
  expect(hostPlatformFromOs("darwin")).toBe("mac");
  expect(hostPlatformFromOs("windows")).toBe("windows");
  expect(hostPlatformFromOs("linux")).toBe("linux");
  expect(hostPlatformFromOs("unknown")).toBeNull();
  expect(hostPlatformFromOs(null)).toBeNull();
});
