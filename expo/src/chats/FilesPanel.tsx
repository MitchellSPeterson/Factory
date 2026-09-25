import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SymbolView } from "expo-symbols";

import { useTheme } from "@/hooks/use-theme";
import { api } from "@/lib/api";
import type { Id } from "@/lib/dataModel";
import { useMutation, useQuery } from "@/lib/factory";
import { CodeView } from "./CodeView";
import { formatBytes, parentPath } from "./files";

const icons = {
  folder: { ios: "folder.fill", android: "folder", web: "folder" },
  file: { ios: "doc.text", android: "description", web: "description" },
  up: { ios: "chevron.left", android: "arrow_back", web: "arrow_back" },
  chevron: { ios: "chevron.right", android: "chevron_right", web: "chevron_right" },
  refresh: { ios: "arrow.clockwise", android: "refresh", web: "refresh" },
} as const;

export function FilesPanel({
  projectId,
  projectName,
  visible,
}: {
  projectId: Id<"projects">;
  projectName: string;
  visible: boolean;
}) {
  const theme = useTheme();
  const rows = useQuery(api.projectOperations.list, { projectId });
  const enqueue = useMutation(api.projectOperations.enqueue);
  const [dir, setDir] = useState("");
  const [file, setFile] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [nonce, setNonce] = useState(0);

  const kind = file === null ? "listFiles" : "readFile";
  const target = file ?? dir;
  useEffect(() => {
    if (!visible) return;
    setError("");
    enqueue({ projectId, operation: { kind, path: target } }).catch((e: unknown) =>
      setError(e instanceof Error ? e.message : "Could not read files."),
    );
  }, [visible, projectId, kind, target, nonce]);

  // Rows are newest first: show the latest finished answer for this path, even while a refresh runs.
  const matching = rows?.filter(
    (row) => row.operation.kind === kind && "path" in row.operation && row.operation.path === target,
  );
  const shown = matching?.find((row) => row.state === "done" || row.state === "failed");
  const loading = matching?.[0] && (matching[0].state === "queued" || matching[0].state === "running");
  const failed = error || (shown?.state === "failed" ? shown.error ?? "Could not read files." : "");

  function up() {
    if (file !== null) setFile(null);
    else setDir(parentPath(dir));
  }

  const crumbs = [projectName, ...(target ? target.split("/") : [])];

  return (
    <View style={styles.root}>
      <View style={[styles.bar, { borderBottomColor: theme.line }]}>
        {target ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Up" hitSlop={8} onPress={up} style={styles.barButton}>
            <SymbolView name={icons.up} size={16} tintColor={theme.text} />
          </Pressable>
        ) : null}
        <Text numberOfLines={1} ellipsizeMode="head" style={[styles.crumbs, { color: theme.textSecondary }]}>
          {crumbs.join(" / ")}
        </Text>
        {loading ? <ActivityIndicator size="small" color={theme.textSecondary} /> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh"
          hitSlop={8}
          onPress={() => setNonce((n) => n + 1)}
          style={styles.barButton}>
          <SymbolView name={icons.refresh} size={15} tintColor={theme.textSecondary} />
        </Pressable>
      </View>

      {failed ? <Text style={[styles.message, { color: theme.danger }]}>{failed}</Text> : null}

      {shown?.result?.kind === "files" ? (
        <ScrollView contentContainerStyle={styles.list}>
          {shown.result.entries.length === 0 ? (
            <Text style={[styles.message, { color: theme.textSecondary }]}>This folder is empty.</Text>
          ) : null}
          {shown.result.entries.map((entry) => {
            const next = dir ? `${dir}/${entry.name}` : entry.name;
            return (
              <Pressable
                key={entry.name}
                accessibilityRole="button"
                accessibilityLabel={`${entry.dir ? "Folder" : "File"} ${entry.name}`}
                onPress={() => (entry.dir ? setDir(next) : setFile(next))}
                style={(state) => [
                  styles.entry,
                  state.pressed && { backgroundColor: theme.subtleHover },
                  (state as { hovered?: boolean }).hovered && { backgroundColor: theme.subtleHover },
                ]}>
                <SymbolView
                  name={entry.dir ? icons.folder : icons.file}
                  size={18}
                  tintColor={entry.dir ? theme.accent : theme.textSecondary}
                />
                <Text numberOfLines={1} style={[styles.name, { color: theme.text }]}>
                  {entry.name}
                </Text>
                {entry.dir ? (
                  <SymbolView name={icons.chevron} size={11} tintColor={theme.textSecondary} />
                ) : entry.size !== undefined ? (
                  <Text style={[styles.size, { color: theme.textSecondary }]}>{formatBytes(entry.size)}</Text>
                ) : null}
              </Pressable>
            );
          })}
          {shown.result.truncated ? (
            <Text style={[styles.message, { color: theme.textSecondary }]}>
              Showing the first 2,000 items. Use the terminal to see the rest.
            </Text>
          ) : null}
        </ScrollView>
      ) : shown?.result?.kind === "file" ? (
        shown.result.binary ? (
          <Text style={[styles.message, { color: theme.textSecondary }]}>
            Binary file · {formatBytes(shown.result.size)}. It can’t be previewed.
          </Text>
        ) : (
          // CodeView owns scrolling, so the web viewer's scrollbars stay on screen.
          <View style={styles.root}>
            {shown.result.truncated ? (
              <Text style={[styles.note, { color: theme.textSecondary }]}>
                Showing the first 100 KB of {formatBytes(shown.result.size)}.
              </Text>
            ) : null}
            <CodeView path={file ?? ""} text={shown.result.text ?? ""} />
          </View>
        )
      ) : !failed ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.textSecondary} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  barButton: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  crumbs: { flex: 1, fontSize: 13, fontWeight: "500" },
  list: { padding: 6, paddingBottom: 48 },
  entry: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderCurve: "continuous",
  },
  name: { flex: 1, fontSize: 15 },
  size: { fontSize: 12, fontVariant: ["tabular-nums"] },
  note: { fontSize: 12, paddingHorizontal: 12, paddingVertical: 8 },
  message: { fontSize: 13, lineHeight: 19, padding: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
});
