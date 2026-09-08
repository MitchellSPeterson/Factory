import { createContext, useContext } from "react";
import type { Id } from "../convex/_generated/dataModel";

export type ProjectScope = Id<"projects"> | "";

export const ProjectScopeContext = createContext<{
  projectId: ProjectScope;
  setProjectId: (projectId: ProjectScope) => void;
}>({
  projectId: "",
  setProjectId: () => {},
});

export const ThemeContext = createContext<{
  theme: "dark" | "light";
  setTheme: (theme: "dark" | "light") => void;
}>({
  theme: "dark",
  setTheme: () => {},
});

export function useProjectScope() {
  return useContext(ProjectScopeContext);
}

export function useTheme() {
  return useContext(ThemeContext);
}
