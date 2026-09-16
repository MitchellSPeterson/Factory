import { useQuery } from "convex/react";
import { createContext, useContext, type ReactNode } from "react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
type Server = FunctionReturnType<typeof api.servers.local>;
const Context = createContext<{ server: Server; accessKey: string }>({ server: null, accessKey: "" });
export function ServerProvider({ children }: { children: ReactNode }) {
  const server = useQuery(api.servers.local);
  return <Context.Provider value={{ server: server === undefined ? null : server, accessKey: "" }}>{children}</Context.Provider>;
}
export const useServer = () => useContext(Context);
