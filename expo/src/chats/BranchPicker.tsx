import { useEffect, useState, type ReactNode } from "react";
import { Platform, ScrollView, View, useWindowDimensions } from "react-native";
import { SymbolView } from "expo-symbols";
import { useCSSVariable } from "uniwind";

import { Button } from "panelui-native/components/button";
import { Input } from "panelui-native/components/input";
import { Spinner } from "panelui-native/components/spinner";
import { CheckIcon, ChevronRightIcon, PlusIcon, SearchIcon } from "panelui-native/icons";
import { AnimatedPressable } from "panelui-native/primitives/animated-pressable";
import { Text } from "panelui-native/primitives/text";

import { useMutation, useQuery } from "@/lib/factory";
import { api } from "@/lib/api";
import type { Id } from "@/lib/dataModel";
import { localBranches, remoteOnlyBranches } from "@/git/format";
import type { ProjectOperation } from "../../../shared/projectOperations";
import { MenuCard } from "./model-picker";

const branchIcon = {
  ios: "arrow.triangle.branch",
  android: "account_tree",
  web: "account_tree",
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
  const { height } = useWindowDimensions();
  const muted = useCSSVariable("--color-muted-foreground") as string | undefined;
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
  const match = (item: { name: string }) => item.name.toLowerCase().includes(q.toLowerCase());
  const branches = [...localBranches(all), ...remoteOnlyBranches(all)].filter(match);
  const canCreate = !!q && !all.some((item) => item.name === q);
  const dirty = (git?.files.length ?? 0) > 0;
  const message = error || failed;

  return (
    <>
      {open ? (
        <MenuCard maxHeight={Math.min(480, Math.round(height * 0.6))}>
          <View className="border-b border-border px-3 py-1.5">
            <Input
              accessibilityLabel="Find or create a branch"
              placeholder="Find or create a branch"
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              autoCapitalize="none"
              onSubmitEditing={() => {
                if (canCreate) void run({ kind: "createBranch", name: q, checkout: true });
              }}
              variant="filled"
              size="sm"
              startContent={<SearchIcon size={16} />}
              interactiveContent={false}
              style={Platform.OS === "web" ? ({ outlineWidth: 0 } as object) : undefined}
            />
          </View>
          {dirty ? (
            <Text className="px-3.5 pt-2.5 text-xs leading-4 text-muted-foreground">
              Uncommitted changes. Commit or stash them before switching.
            </Text>
          ) : null}
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="p-1.5">
            {canCreate ? (
              <Row
                icon={<PlusIcon size={16} color={muted} />}
                label={`Create branch “${q}”`}
                detail={`From ${git?.branch ?? "the current commit"}`}
                onPress={() => void run({ kind: "createBranch", name: q, checkout: true })}
              />
            ) : null}
            {!git ? (
              <View className="m-5 items-center">
                <Spinner label="Loading branches" />
              </View>
            ) : (
              branches.map((item) => {
                // Checked out in another worktree; git refuses to switch here.
                const elsewhere = !item.current && !!item.worktreePath;
                return (
                  <Row
                    key={item.name}
                    icon={<SymbolView name={branchIcon} size={16} tintColor={muted} />}
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
                  />
                );
              })
            )}
            {git && !branches.length && !canCreate ? (
              <Text className="px-3.5 pt-2.5 text-xs leading-4 text-muted-foreground">No branches.</Text>
            ) : null}
          </ScrollView>
        </MenuCard>
      ) : null}
      <View className="mb-1 flex-row items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          accessibilityLabel={`Branch ${git?.branch ?? ""}`}
          accessibilityState={{ expanded: open }}
          onPress={onToggle}
          className={`max-w-[260px] ${open ? "bg-surface" : ""}`}
          startContent={<SymbolView name={branchIcon} size={14} tintColor={muted} />}
          endContent={working ? <Spinner size="sm" /> : <ChevronRightIcon size={11} />}
        >
          <Text numberOfLines={1} className="shrink text-[13px] font-semibold text-muted-foreground">
            {git?.branch ?? "Branch"}
          </Text>
        </Button>
        {message ? (
          <Text numberOfLines={2} className="flex-1 text-xs text-destructive">
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
}: {
  icon: ReactNode;
  label: string;
  detail?: string;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const primary = useCSSVariable("--color-primary") as string | undefined;
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`min-h-12 flex-row items-center gap-2.5 rounded-xl px-2.5 active:bg-primary/15 ${
        selected ? "bg-primary/15" : "bg-transparent"
      } ${disabled && !selected ? "opacity-40" : ""}`}
    >
      {icon}
      <View className="flex-1 gap-0.5">
        <Text numberOfLines={1} className="text-[15px] font-medium text-foreground">
          {label}
        </Text>
        {detail ? <Text className="text-xs text-muted-foreground">{detail}</Text> : null}
      </View>
      {selected ? <CheckIcon size={16} color={primary} /> : null}
    </AnimatedPressable>
  );
}
