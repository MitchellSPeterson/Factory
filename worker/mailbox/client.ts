import path from "node:path";
import type { ApiFn } from "../../shared/mailboxApi";
import { dispatch, type DispatchKind } from "./functions";
import { openMailbox, openStore, uploadsDir, type Store } from "./store";

export type Mailbox = {
  url: string;
  query: <A extends object, R>(ref: ApiFn<A, R>, args?: A) => Promise<R>;
  mutation: <A extends object, R>(ref: ApiFn<A, R>, args?: A) => Promise<R>;
  action: <A extends object, R>(ref: ApiFn<A, R>, args?: A) => Promise<R>;
};

function pathOf(ref: string) {
  return ref;
}

export function localMailbox(store: Store, uploads: string, origin = "http://127.0.0.1:3402", token?: string): Mailbox {
  async function run<T>(kind: DispatchKind, ref: string, args?: object): Promise<T> {
    return (await dispatch(kind, pathOf(ref), (args ?? {}) as Record<string, unknown>, {
      store,
      origin,
      uploads,
      token,
    })) as T;
  }
  return {
    url: origin,
    query: (ref, args) => run("query", ref, args),
    mutation: (ref, args) => run("mutation", ref, args),
    action: (ref, args) => run("action", ref, args),
  };
}

export function mailboxForRoot(root: string, origin?: string): Mailbox {
  return localMailbox(openMailbox(root), uploadsDir(root), origin);
}

export function mailboxForFile(file: string, origin = "http://127.0.0.1:3402"): Mailbox {
  return localMailbox(openStore(file), path.join(path.dirname(file), "uploads"), origin);
}

export function httpMailbox(url: string, token: string): Mailbox {
  const base = url.replace(/\/$/, "");
  async function rpc<T>(kind: string, ref: string, args?: object): Promise<T> {
    const response = await fetch(`${base}/api/${kind}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ path: pathOf(ref), args: args ?? {}, format: "json" }),
    });
    const json: unknown = await response.json().catch(() => null);
    if (!json || typeof json !== "object") throw new Error("Worker mailbox did not respond.");
    const body = json as { status?: string; value?: unknown; errorMessage?: string };
    if (body.status === "error") throw new Error(body.errorMessage ?? "Worker error");
    return body.value as T;
  }
  return {
    url: base,
    query: (ref, args) => rpc("query", ref, args),
    mutation: (ref, args) => rpc("mutation", ref, args),
    action: (ref, args) => rpc("action", ref, args),
  };
}
