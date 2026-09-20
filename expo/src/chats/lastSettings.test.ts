import { expect, test } from "bun:test";
import { CODEX_MODELS } from "../../../shared/agentModel";
import { DEFAULT_CHAT_SETTINGS, parseLastSettings } from "./lastSettings";

test("defaults to Codex Terra", () => {
  expect(DEFAULT_CHAT_SETTINGS).toEqual({
    provider: "codex",
    model: CODEX_MODELS[0],
    effort: "medium",
    permissionMode: "supervised",
    serviceTier: "standard",
  });
  expect(DEFAULT_CHAT_SETTINGS.model).toBe("gpt-5.6-terra");
});

test("parseLastSettings returns the stored model", () => {
  expect(
    parseLastSettings(
      JSON.stringify({
        provider: "codex",
        model: "gpt-6-astra",
        effort: "high",
        permissionMode: "full-access",
        serviceTier: "flex",
      }),
    ),
  ).toEqual({
    provider: "codex",
    model: "gpt-6-astra",
    effort: "high",
    permissionMode: "full-access",
    serviceTier: "flex",
  });
});

test("parseLastSettings aliases retired Cursor model ids", () => {
  expect(
    parseLastSettings(
      JSON.stringify({ provider: "cursor", model: "auto-smart", effort: "medium" }),
    ),
  ).toEqual({
    provider: "cursor",
    model: "default",
    effort: "medium",
    permissionMode: "supervised",
    serviceTier: "standard",
  });
  expect(
    parseLastSettings(
      JSON.stringify({
        provider: "cursor",
        model: "claude-opus-5-thinking-high",
        effort: "high",
      }),
    ),
  ).toMatchObject({ provider: "cursor", model: "claude-opus-5", effort: "high" });
  expect(
    parseLastSettings(
      JSON.stringify({ provider: "cursor", model: "gpt-5.6-sol-medium", effort: "low" }),
    ),
  ).toMatchObject({ provider: "cursor", model: "gpt-5.6-sol", effort: "low" });
});

test("parseLastSettings keeps Grok and Cursor picks", () => {
  expect(
    parseLastSettings(
      JSON.stringify({ provider: "grok", model: "grok-4.6", effort: "low" }),
    ),
  ).toEqual({
    provider: "grok",
    model: "grok-4.6",
    effort: "low",
    permissionMode: "supervised",
    serviceTier: "standard",
  });
  expect(
    parseLastSettings(
      JSON.stringify({
        provider: "cursor",
        model: "composer-2.5",
        effort: "medium",
      }),
    ),
  ).toEqual({
    provider: "cursor",
    model: "composer-2.5",
    effort: "medium",
    permissionMode: "supervised",
    serviceTier: "standard",
  });
});

test("parseLastSettings falls back when the payload is invalid", () => {
  expect(parseLastSettings("")).toEqual(DEFAULT_CHAT_SETTINGS);
  expect(parseLastSettings("not-json")).toEqual(DEFAULT_CHAT_SETTINGS);
  expect(parseLastSettings("[]")).toEqual(DEFAULT_CHAT_SETTINGS);
  expect(
    parseLastSettings(
      JSON.stringify({
        provider: "codex",
        model: "gpt-does-not-exist",
        effort: "medium",
      }),
    ),
  ).toEqual(DEFAULT_CHAT_SETTINGS);
  expect(
    parseLastSettings(
      JSON.stringify({
        provider: "openai",
        model: "gpt-6-astra",
        effort: "medium",
      }),
    ),
  ).toEqual(DEFAULT_CHAT_SETTINGS);
  expect(
    parseLastSettings(
      JSON.stringify({
        provider: "codex",
        model: "gpt-6-astra",
        effort: "ludicrous",
      }),
    ),
  ).toEqual(DEFAULT_CHAT_SETTINGS);
  expect(
    parseLastSettings(
      JSON.stringify({
        provider: "codex",
        model: "gpt-6-astra",
        effort: "high",
        permissionMode: "yolo",
        serviceTier: "turbo",
      }),
    ),
  ).toEqual({
    provider: "codex",
    model: "gpt-6-astra",
    effort: "high",
    permissionMode: "supervised",
    serviceTier: "standard",
  });
});
