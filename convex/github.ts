import { action } from "./_generated/server";
import { v } from "convex/values";

// Device authorization is proxied because GitHub's login endpoints do not
// support browser CORS. Credentials are never persisted in Factory tables.
async function deviceRequest(path: string, fields: Record<string, string>) {
  const response = await fetch(`https://github.com/login/${path}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields),
  });
  if (!response.ok) throw new Error("GitHub sign-in is unavailable. Try again shortly.");
  const data: unknown = await response.json();
  if (!data || typeof data !== "object") throw new Error("Unexpected GitHub response.");
  return data as Record<string, unknown>;
}
function client(value: string) {
  if (!/^[A-Za-z0-9_.-]{10,100}$/.test(value)) throw new Error("Enter a valid GitHub App client ID.");
  return value;
}
export const begin = action({
  args: { clientId: v.string() },
  returns: v.object({ deviceCode: v.string(), userCode: v.string(), expiresIn: v.number(), interval: v.number() }),
  handler: async (_ctx, args) => {
    const data = await deviceRequest("device/code", { client_id: client(args.clientId) });
    if (typeof data.device_code !== "string" || typeof data.user_code !== "string" || typeof data.expires_in !== "number" || typeof data.interval !== "number") {
      throw new Error("Unable to start GitHub sign-in. Check the client ID and enable Device Flow in your GitHub App settings.");
    }
    return { deviceCode: data.device_code, userCode: data.user_code, expiresIn: data.expires_in, interval: data.interval };
  },
});
export const poll = action({
  args: { clientId: v.string(), deviceCode: v.string() },
  returns: v.object({ status: v.union(v.literal("pending"), v.literal("slow_down"), v.literal("connected")), token: v.optional(v.string()) }),
  handler: async (_ctx, args) => {
    if (!args.deviceCode || args.deviceCode.length > 256) throw new Error("Invalid device code.");
    const data = await deviceRequest("oauth/access_token", { client_id: client(args.clientId), device_code: args.deviceCode, grant_type: "urn:ietf:params:oauth:grant-type:device_code" });
    if (typeof data.access_token === "string") return { status: "connected" as const, token: data.access_token };
    if (data.error === "authorization_pending") return { status: "pending" as const };
    if (data.error === "slow_down") return { status: "slow_down" as const };
    if (data.error === "access_denied") throw new Error("GitHub sign-in was declined.");
    if (data.error === "expired_token") throw new Error("The code expired. Start GitHub sign-in again.");
    throw new Error("GitHub sign-in failed. Check your App settings and try again.");
  },
});
