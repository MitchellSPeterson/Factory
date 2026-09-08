import { useConvex } from "convex/react";
import { createContext, useContext, useState, type ReactNode } from "react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
type Server = FunctionReturnType<typeof api.servers.paired>;
const Context = createContext<{ server: Server | null; accessKey: string; pair: (key: string) => Promise<void>; unpair: () => void }>({ server: null, accessKey: "", pair: async () => {}, unpair: () => {} });
export function ServerProvider({ children }: { children: ReactNode }) {
  const client = useConvex();
  const [paired, setPaired] = useState<{ server: Server; accessKey: string } | null>(null);
  async function pair(key: string) { const accessKey = key.trim(); const server = await client.query(api.servers.paired, { accessKey }); setPaired({ server, accessKey }); }
  return <Context.Provider value={{ server: paired?.server ?? null, accessKey: paired?.accessKey ?? "", pair, unpair: () => setPaired(null) }}>{children}</Context.Provider>;
}
export const useServer = () => useContext(Context);
