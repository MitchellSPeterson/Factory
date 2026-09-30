import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

export type Doc = {
  _id: string;
  _creationTime: number;
} & Record<string, unknown>;

export type Store = {
  get: (id: string) => Doc | null;
  list: (table: string) => Doc[];
  /** Rows of `table` whose JSON `field` equals `value`, via expression index. Newest first unless `order` is "asc". */
  listBy: (table: string, field: IndexedField, value: string | number, order?: "asc" | "desc") => Doc[];
  insert: (table: string, data: Record<string, unknown>) => string;
  patch: (id: string, next: Record<string, unknown>) => void;
  delete: (id: string) => void;
  subscribe: (fn: () => void) => () => void;
  close: () => void;
  transaction: <T>(run: () => T) => T;
};

export const INDEXED_FIELDS = ["sessionId", "terminalId", "projectId", "serverId", "token"] as const;
export type IndexedField = (typeof INDEXED_FIELDS)[number];

const BY_SQL = Object.fromEntries(
  INDEXED_FIELDS.map((f) => [f, `json_extract(json, '$.${f}')`]),
) as Record<IndexedField, string>;

const NOTIFY_MS = 50;

export function openStore(file: string): Store {
  const db = new Database(file, { create: true });
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(`CREATE TABLE IF NOT EXISTS docs (
    id TEXT PRIMARY KEY,
    table_name TEXT NOT NULL,
    created_at REAL NOT NULL,
    json TEXT NOT NULL
  )`);
  db.exec("CREATE INDEX IF NOT EXISTS docs_table ON docs(table_name)");
  // SQLite only uses an expression index when the expression text matches exactly; BY_SQL is the single source.
  for (const f of INDEXED_FIELDS) db.exec(`CREATE INDEX IF NOT EXISTS docs_by_${f} ON docs(table_name, ${BY_SQL[f]})`);
  const listeners = new Set<() => void>();
  let transactionDepth = 0;
  let pendingNotification = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  function notify() {
    if (transactionDepth) { pendingNotification = true; return; }
    // Coalesce bursts into one trailing tick per NOTIFY_MS.
    if (timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      for (const fn of listeners) fn();
    }, NOTIFY_MS);
  }
  function parse(row: { id: string; created_at: number; json: string }): Doc {
    return { ...(JSON.parse(row.json) as Record<string, unknown>), _id: row.id, _creationTime: row.created_at };
  }
  return {
    transaction(run) {
      const priorNotification = pendingNotification;
      transactionDepth += 1;
      let result: ReturnType<typeof run>;
      try { result = db.transaction(run)(); }
      catch (error) { transactionDepth -= 1; pendingNotification = priorNotification; throw error; }
      transactionDepth -= 1;
      if (!transactionDepth && pendingNotification) { pendingNotification = false; notify(); }
      return result;
    },
    get(id) {
      const row = db.query("SELECT id, created_at, json FROM docs WHERE id = ?").get(id) as
        | { id: string; created_at: number; json: string }
        | null;
      return row ? parse(row) : null;
    },
    list(table) {
      const rows = db
        .query("SELECT id, created_at, json FROM docs WHERE table_name = ? ORDER BY created_at DESC, rowid DESC")
        .all(table) as { id: string; created_at: number; json: string }[];
      return rows.map(parse);
    },
    listBy(table, field, value, order = "desc") {
      const expr = BY_SQL[field];
      if (!expr) throw new Error("Field is not indexed.");
      const dir = order === "asc" ? "ASC" : "DESC";
      const rows = db
        .query(`SELECT id, created_at, json FROM docs WHERE table_name = ? AND ${expr} = ? ORDER BY created_at ${dir}, rowid ${dir}`)
        .all(table, value) as { id: string; created_at: number; json: string }[];
      return rows.map(parse);
    },
    insert(table, data) {
      const id = `${table}_${crypto.randomUUID().replaceAll("-", "")}`;
      const created = Date.now();
      db.run("INSERT INTO docs (id, table_name, created_at, json) VALUES (?, ?, ?, ?)", [
        id,
        table,
        created,
        JSON.stringify(data),
      ]);
      notify();
      return id;
    },
    patch(id, next) {
      const row = this.get(id);
      if (!row) throw new Error("Not found");
      const { _id: _keep, _creationTime: _time, ...rest } = row;
      const merged = { ...rest };
      for (const [key, value] of Object.entries(next)) {
        if (value === undefined) delete merged[key];
        else merged[key] = value;
      }
      db.run("UPDATE docs SET json = ? WHERE id = ?", [JSON.stringify(merged), id]);
      notify();
    },
    delete(id) {
      db.run("DELETE FROM docs WHERE id = ?", [id]);
      notify();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    close() {
      clearTimeout(timer);
      timer = undefined;
      db.close();
    },
  };
}

let singleton: Store | undefined;
let singletonRoot = "";

export function mailboxPath(root: string) {
  return path.join(root, ".factory", "mailbox.sqlite");
}

export function uploadsDir(root: string) {
  return path.join(root, ".factory", "uploads");
}

export function openMailbox(root: string): Store {
  if (singleton && singletonRoot === root) return singleton;
  singleton?.close();
  const dir = path.join(root, ".factory");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  mkdirSync(path.join(dir, "uploads"), { recursive: true, mode: 0o700 });
  singleton = openStore(mailboxPath(root));
  singletonRoot = root;
  return singleton;
}
