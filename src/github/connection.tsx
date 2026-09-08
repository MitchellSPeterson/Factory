import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { github } from "./api";

type Connection = { token: string; login: string };
const Context = createContext<{ connection: Connection | null; connect: (token: string, signal?: AbortSignal) => Promise<void>; disconnect: () => void }>({ connection: null, connect: async () => {}, disconnect: () => {} });
export function GitHubProvider({ children }: { children: ReactNode }) {
  const [connection, setConnection] = useState<Connection | null>(null);
  const connect = useCallback(async (raw: string, signal?: AbortSignal) => {
    const token = raw.trim();
    if (!token) throw new Error("Enter a GitHub token.");
    const user = await github<{ login: string }>(token, "/user", signal);
    if (!signal?.aborted) setConnection({ token, login: user.login });
  }, []);
  return <Context.Provider value={{ connection, connect, disconnect: () => setConnection(null) }}>{children}</Context.Provider>;
}
export const useGitHub = () => useContext(Context);
