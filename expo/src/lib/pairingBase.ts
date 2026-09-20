export function pairingBase(input: string) {
  const trimmed = input.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed.replace(/\/$/, "");
  if (trimmed.includes(":")) return `http://${trimmed}`;
  return `http://${trimmed}:3402`;
}

export function localWorkerBase(hostname = "127.0.0.1") {
  const host = hostname === "localhost" || hostname === "127.0.0.1" ? hostname : "127.0.0.1";
  return `http://${host}:3402`;
}

export function pairingFromLocalPair(body: unknown, base: string): { url: string; token: string } | null {
  if (!body || typeof body !== "object") return null;
  const token = typeof (body as { token?: unknown }).token === "string" ? (body as { token: string }).token.trim() : "";
  if (!token) return null;
  return { url: base.replace(/\/$/, ""), token };
}
