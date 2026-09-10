import { useMutation, useQuery } from "convex/react";
import { createContext, useCallback, useContext, useEffect, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import { github } from "./api";
import { readStoredConnection, writeStoredConnection, type StoredGitHubConnection } from "./connectionState";

type Connection = StoredGitHubConnection;
const Context = createContext<{ connection: Connection | null; connect: (token: string, signal?: AbortSignal) => Promise<void>; disconnect: () => void }>({ connection: null, connect: async () => {}, disconnect: () => {} });
export function GitHubProvider({ children }: { children: ReactNode }) {
  const stored = useQuery(api.github.connection);
  const save = useMutation(api.github.save);
  const clear = useMutation(api.github.disconnect);
  const connection = stored ?? readStoredConnection();
  useEffect(() => {
    if (stored === undefined) return;
    if (stored) {
      writeStoredConnection(null);
      return;
    }
    const local = readStoredConnection();
    if (!local) return;
    void save(local).then(() => writeStoredConnection(null));
  }, [stored, save]);
  const connect = useCallback(async (raw: string, signal?: AbortSignal) => {
    const token = raw.trim();
    if (!token) throw new Error("Enter a GitHub token.");
    const user = await github<{ login: string }>(token, "/user", signal);
    if (signal?.aborted) return;
    await save({ token, login: user.login });
  }, [save]);
  const disconnect = useCallback(() => {
    writeStoredConnection(null);
    void clear();
  }, [clear]);
  return <Context.Provider value={{ connection, connect, disconnect }}>{children}</Context.Provider>;
}
export const useGitHub = () => useContext(Context);
