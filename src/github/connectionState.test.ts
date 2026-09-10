import { describe, expect, test } from "bun:test";
import { connectionFromStorage, GITHUB_CONNECTION_STORAGE_KEY, readStoredConnection, writeStoredConnection } from "./connectionState";

describe("connectionFromStorage", () => {
  test("reads a saved token and login", () => {
    expect(connectionFromStorage(JSON.stringify({ token: "github_pat_abc", login: "octocat" }))).toEqual({
      token: "github_pat_abc",
      login: "octocat",
    });
  });

  test("rejects missing, empty, or malformed values", () => {
    expect(connectionFromStorage(null)).toBeNull();
    expect(connectionFromStorage("")).toBeNull();
    expect(connectionFromStorage("{")).toBeNull();
    expect(connectionFromStorage(JSON.stringify({ token: "github_pat_abc" }))).toBeNull();
    expect(connectionFromStorage(JSON.stringify({ login: "octocat" }))).toBeNull();
    expect(connectionFromStorage(JSON.stringify({ token: "  ", login: "octocat" }))).toBeNull();
    expect(connectionFromStorage(JSON.stringify({ token: "github_pat_abc", login: "  " }))).toBeNull();
    expect(connectionFromStorage(JSON.stringify({ token: 1, login: "octocat" }))).toBeNull();
  });
});

describe("readStoredConnection / writeStoredConnection", () => {
  const store = new Map<string, string>();
  const memory = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
  };

  test("round-trips a connection and clears on disconnect", () => {
    Object.assign(globalThis, { localStorage: memory });
    writeStoredConnection({ token: "github_pat_abc", login: "octocat" });
    expect(store.get(GITHUB_CONNECTION_STORAGE_KEY)).toBe(JSON.stringify({ token: "github_pat_abc", login: "octocat" }));
    expect(readStoredConnection()).toEqual({ token: "github_pat_abc", login: "octocat" });
    writeStoredConnection(null);
    expect(store.has(GITHUB_CONNECTION_STORAGE_KEY)).toBe(false);
    expect(readStoredConnection()).toBeNull();
  });
});
