import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { SymbolView } from "expo-symbols";
import { useMutation, useQuery } from "@/lib/factory";
import { api } from "@/lib/api";
import type { Id } from "@/lib/dataModel";
import { useTheme } from "@/hooks/use-theme";
import { Colors } from "@/constants/theme";
import { localBranches, remoteOnlyBranches } from "@/git/format";
import type { GitBranch, ProjectOperation } from "../../../shared/projectOperations";
import { MenuCard } from "./model-picker";

const icons = {
  branch: { ios: "arrow.triangle.branch", android: "account_tree", web: "account_tree" },
  chevron: { ios: "chevron.right", android: "chevron_right", web: "chevron_right" },
  check: { ios: "checkmark", android: "check", web: "check" },
  add: { ios: "plus", android: "add", web: "add" },
  search: { ios: "magnifyingglass", android: "search", web: "search" },
} as const;

/** Branch chip above a new chat's composer: switch branches or start a feature branch before the agent runs. */
export function BranchPicker({
  projectId,
  open,
  onToggle,
  onClose,
}: {
  projectId: Id<"projects">;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const { height } = useWindowDimensions();
  const rows = useQuery(api.projectOperations.list, { projectId });
  const enqueue = useMutation(api.projectOperations.enqueue);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [lastId, setLastId] = useState<string | null>(null);
  const snapshot = rows?.find((row) => row.result?.kind === "status");
  const git = snapshot?.result?.kind === "status" ? snapshot.result : undefined;
  const last = rows?.find((row) => row._id === lastId);
  const working = last?.state === "queued" || last?.state === "running";
  const failed = last?.error ?? (last?.state === "failed" ? "Could not switch branches." : "");

  useEffect(() => {
    void enqueue({ projectId, operation: { kind: "status" } }).catch(() => {});
  }, [projectId]);
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  async function run(operation: ProjectOperation) {
    setError("");
    onClose();
    try {
      setLastId(await enqueue({ projectId, operation }));
      await enqueue({ projectId, operation: { kind: "status" } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not switch branches.");
    }
  }

  const q = query.trim();
  const all = git?.branches ?? [];
  const match = (item: GitBranch) => item.name.toLowerCase().includes(q.toLowerCase());
  const branches = [...localBranches(all), ...remoteOnlyBranches(all)].filter(match);
  const canCreate = !!q && !all.some((item) => item.name === q);
  const dirty = (git?.files.length ?? 0) > 0;
  const selectedFill =
    theme.background === Colors.dark.background ? "rgba(255,255,255,0.08)" : "#f0f0f2";
  const message = error || failed;

  return (
    <>
      {open ? (
        <MenuCard maxHeight={Math.min(480, Math.round(height * 0.6))}>
          <View style={[styles.search, { borderBottomColor: theme.lineStrong }]}>
            <SymbolView name={icons.search} size={16} tintColor={theme.textSecondary} />
            <TextInput
              accessibilityLabel="Find or create a branch"
              placeholder="Find or create a branch"
              placeholderTextColor={theme.textSecondary}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              autoCapitalize="none"
              onSubmitEditing={() => {
                if (canCreate) void run({ kind: "createBranch", name: q, checkout: true });
              }}
              style={[
                styles.searchInput,
                { color: theme.text },
                Platform.OS === "web" ? ({ outlineWidth: 0 } as object) : null,
              ]}
            />
          </View>
          {dirty ? (
            <Text style={[styles.hint, { color: theme.textSecondary }]}>
              Uncommitted changes. Commit or stash them before switching.
            </Text>
          ) : null}
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.list}>
            {canCreate ? (
              <Row
                icon={icons.add}
                label={`Create branch “${q}”`}
                detail={`From ${git?.branch ?? "the current commit"}`}
                onPress={() => void run({ kind: "createBranch", name: q, checkout: true })}
                fill={selectedFill}
              />
            ) : null}
            {!git ? (
              <ActivityIndicator color={theme.accent} style={{ margin: 20 }} />
            ) : (
              branches.map((item) => {
                // Checked out in another worktree; git refuses to switch here.
                const elsewhere = !item.current && !!item.worktreePath;
                return (
                  <Row
                    key={item.name}
                    icon={icons.branch}
                    label={item.name}
                    detail={
                      item.current
                        ? "Current"
                        : elsewhere
                          ? "In another worktree"
                          : item.remote
                            ? "Remote"
                            : undefined
                    }
                    selected={item.current}
                    disabled={item.current || elsewhere}
                    onPress={() => void run({ kind: "checkout", branch: item.name })}
                    fill={selectedFill}
                  />
                );
              })
            )}
            {git && !branches.length && !canCreate ? (
              <Text style={[styles.hint, { color: theme.textSecondary }]}>No branches.</Text>
            ) : null}
          </ScrollView>
        </MenuCard>
      ) : null}
      <View style={styles.bar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Branch ${git?.branch ?? ""}`}
          accessibilityState={{ expanded: open }}
          onPress={onToggle}
          style={({ pressed }) => [
            styles.chip,
            { backgroundColor: open || pressed ? theme.subtleHover : "transparent" },
          ]}
        >
          <SymbolView name={icons.branch} size={14} tintColor={theme.textSecondary} />
          <Text numberOfLines={1} style={[styles.chipText, { color: theme.textSecondary }]}>
            {git?.branch ?? "Branch"}
          </Text>
          {working ? (
            <ActivityIndicator size="small" color={theme.accent} />
          ) : (
            <SymbolView name={icons.chevron} size={11} tintColor={theme.textSecondary} />
          )}
        </Pressable>
        {message ? (
          <Text numberOfLines={2} style={[styles.error, { color: theme.danger }]}>
            {message}
          </Text>
        ) : null}
      </View>
    </>
  );
}

function Row({
  icon,
  label,
  detail,
  selected,
  disabled,
  onPress,
  fill,
}: {
  icon: (typeof icons)[keyof typeof icons];
  label: string;
  detail?: string;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
  fill: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: selected || pressed ? fill : "transparent",
          opacity: disabled && !selected ? 0.4 : 1,
        },
      ]}
    >
      <SymbolView name={icon} size={16} tintColor={theme.textSecondary} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={1} style={{ color: theme.text, fontSize: 15, fontWeight: "500" }}>
          {label}
        </Text>
        {detail ? (
          <Text style={{ color: theme.textSecondary, fontSize: 12 }}>{detail}</Text>
        ) : null}
      </View>
      {selected ? <SymbolView name={icons.check} size={16} tintColor={theme.accent} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    height: 44,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 8 },
  hint: { fontSize: 12, lineHeight: 16, paddingHorizontal: 14, paddingTop: 10 },
  list: { padding: 6 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderCurve: "continuous",
  },
  bar: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderCurve: "continuous",
    maxWidth: 260,
  },
  chipText: { fontSize: 13, fontWeight: "600", flexShrink: 1 },
  error: { flex: 1, fontSize: 12 },
});
