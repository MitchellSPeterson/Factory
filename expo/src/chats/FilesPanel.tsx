import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { useCSSVariable } from "uniwind";

import { Alert } from "panelui-native/components/alert";
import { Button } from "panelui-native/components/button";
import { EmptyState } from "panelui-native/components/empty-state";
import { Item } from "panelui-native/components/item";
import { Spinner } from "panelui-native/components/spinner";
import { ChevronLeftIcon, ChevronRightIcon, FileIcon, FolderIcon, RotateCwIcon } from "panelui-native/icons";
import { Text } from "panelui-native/primitives/text";

import { api } from "@/lib/api";
import type { Id } from "@/lib/dataModel";
import { useMutation, useQuery } from "@/lib/factory";
import { CodeView } from "./CodeView";
import { formatBytes, parentPath } from "./files";

function FileRow({
  name,
  dir,
  size,
  folderColor,
  fileColor,
  onPress,
}: {
  name: string;
  dir: boolean;
  size?: number;
  folderColor?: string;
  fileColor?: string;
  onPress: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Item
      size="sm"
      accessibilityLabel={`${dir ? "Folder" : "File"} ${name}`}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      className={`min-h-11 ${hovered ? "bg-surface" : "bg-transparent"}`}
    >
      <Item.Media>
        {dir ? <FolderIcon size={18} color={folderColor} /> : <FileIcon size={18} color={fileColor} />}
      </Item.Media>
      <Item.Content>
        <Item.Title numberOfLines={1} className="text-[15px] font-normal">
          {name}
        </Item.Title>
      </Item.Content>
      <Item.Actions>
        {dir ? (
          <ChevronRightIcon size={11} color={fileColor} />
        ) : size !== undefined ? (
          <Text className="text-xs tabular-nums text-muted-foreground">{formatBytes(size)}</Text>
        ) : null}
      </Item.Actions>
    </Item>
  );
}

export function FilesPanel({
  projectId,
  projectName,
  visible,
}: {
  projectId: Id<"projects">;
  projectName: string;
  visible: boolean;
}) {
  const [primary, muted] = useCSSVariable(["--color-primary", "--color-muted-foreground"]) as (
    | string
    | undefined
  )[];
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
  const failed = error || (shown?.state === "failed" ? (shown.error ?? "Could not read files.") : "");

  function up() {
    if (file !== null) setFile(null);
    else setDir(parentPath(dir));
  }

  const crumbs = [projectName, ...(target ? target.split("/") : [])];

  return (
    <View className="min-h-0 flex-1">
      <View className="min-h-11 flex-row items-center gap-1.5 border-b border-border px-2.5">
        {target ? (
          <Button variant="ghost" size="icon" accessibilityLabel="Up" onPress={up} className="h-8 w-8">
            <ChevronLeftIcon size={16} />
          </Button>
        ) : null}
        <Text
          numberOfLines={1}
          ellipsizeMode="head"
          className="flex-1 text-[13px] font-medium text-muted-foreground"
        >
          {crumbs.join(" / ")}
        </Text>
        {loading ? <Spinner size="sm" /> : null}
        <Button
          variant="ghost"
          size="icon"
          accessibilityLabel="Refresh"
          onPress={() => setNonce((n) => n + 1)}
          className="h-8 w-8"
        >
          <RotateCwIcon size={15} />
        </Button>
      </View>

      {failed ? (
        <Alert variant="destructive" className="mx-3 mt-3">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{failed}</Alert.Title>
          </Alert.Content>
        </Alert>
      ) : null}

      {shown?.result?.kind === "files" ? (
        <ScrollView contentContainerClassName="p-1.5 pb-12">
          {shown.result.entries.length === 0 ? (
            <EmptyState size="sm" className="flex-none py-6">
              <EmptyState.Description>This folder is empty.</EmptyState.Description>
            </EmptyState>
          ) : null}
          {shown.result.entries.map((entry) => {
            const next = dir ? `${dir}/${entry.name}` : entry.name;
            return (
              <FileRow
                key={entry.name}
                name={entry.name}
                dir={entry.dir}
                size={entry.size}
                folderColor={primary}
                fileColor={muted}
                onPress={() => (entry.dir ? setDir(next) : setFile(next))}
              />
            );
          })}
          {shown.result.truncated ? (
            <Text className="p-4 text-[13px] leading-[19px] text-muted-foreground">
              Showing the first 2,000 items. Use the terminal to see the rest.
            </Text>
          ) : null}
        </ScrollView>
      ) : shown?.result?.kind === "file" ? (
        shown.result.binary ? (
          <Text className="p-4 text-[13px] leading-[19px] text-muted-foreground">
            Binary file · {formatBytes(shown.result.size)}. It can’t be previewed.
          </Text>
        ) : (
          // CodeView owns scrolling, so the web viewer's scrollbars stay on screen.
          <View className="min-h-0 flex-1">
            {shown.result.truncated ? (
              <Text className="px-3 py-2 text-xs text-muted-foreground">
                Showing the first 100 KB of {formatBytes(shown.result.size)}.
              </Text>
            ) : null}
            <CodeView path={file ?? ""} text={shown.result.text ?? ""} />
          </View>
        )
      ) : !failed ? (
        <View className="flex-1 items-center justify-center p-6">
          <Spinner label="Loading files" />
        </View>
      ) : null}
    </View>
  );
}
