import { forwardRef, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";

import { Badge } from "panelui-native/components/badge";
import { Button } from "panelui-native/components/button";
import { EmptyState } from "panelui-native/components/empty-state";
import { Item } from "panelui-native/components/item";
import { SearchBar } from "panelui-native/components/search-bar";
import { Spinner } from "panelui-native/components/spinner";
import { ThinkingOrb } from "panelui-native/components/thinking-orb";
import { TrashIcon } from "panelui-native/icons";

import { useQuery } from "@/lib/factory";
import type { Id } from "@/lib/dataModel";
import { api } from "@/lib/api";
import { inProjectScope } from "@/lib/project-scope";
import { useProjectScope } from "@/lib/project-scope-context";
import { ProviderMark } from "@/chats/model-picker";

function statusTone(status: string): "running" | "failed" | "idle" {
  if (status === "running" || status === "queued") return "running";
  if (status === "failed") return "failed";
  return "idle";
}

function StatusDot({ tone }: { tone: "running" | "failed" | "idle" }) {
  if (tone === "idle") return null;
  if (tone === "running") return <ThinkingOrb state="working" size={16} />;
  return <Badge shape="dot" variant="destructive" className="h-2.5 w-2.5" />;
}

function ChatRow({
  title,
  projectName,
  provider,
  status,
  selected,
  dense,
  onOpen,
  onDelete,
}: {
  title: string;
  projectName?: string;
  provider: "codex" | "cursor" | "grok" | "claude" | "openai";
  status: string;
  selected: boolean;
  dense?: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  // RN-web ends a Pressable's hover when a nested Pressable is entered, so the
  // two sibling buttons report hover themselves (web forbids nested <button>s).
  const [hovered, setHovered] = useState(false);
  const hover = {
    onHoverIn: () => setHovered(true),
    onHoverOut: () => setHovered(false),
  };
  const tone = statusTone(status);
  return (
    <View
      className={`flex-row items-stretch ${dense ? "rounded-lg" : "rounded-xl"} ${
        selected ? "bg-primary/15" : hovered ? "bg-surface" : "bg-transparent"
      }`}
    >
      <Pressable
        {...hover}
        accessibilityRole="button"
        accessibilityLabel={`${title}${projectName ? `, ${projectName}` : ""}, ${status}`}
        accessibilityHint="Hold to delete"
        accessibilityActions={[{ name: "delete", label: "Delete" }]}
        accessibilityState={{ selected }}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "delete") onDelete();
        }}
        onPress={onOpen}
        onLongPress={onDelete}
        className={`min-w-0 flex-1 ${!selected ? "active:bg-surface" : ""}`}
      >
        <Item size={dense ? "xs" : "sm"} className="bg-transparent">
          <Item.Media>
            <ProviderMark provider={provider} size={dense ? 16 : 18} />
          </Item.Media>
          <Item.Content>
            <Item.Title numberOfLines={dense ? 1 : 2} className={dense ? "text-[13px] font-normal" : undefined}>
              {title}
            </Item.Title>
            {projectName ? <Item.Description numberOfLines={1}>{projectName}</Item.Description> : null}
          </Item.Content>
        </Item>
      </Pressable>
      {dense ? (
        <Button
          {...hover}
          variant="ghost"
          size="icon"
          accessibilityLabel={`Delete ${title}`}
          onPress={onDelete}
          pressScale={1}
          className="h-auto w-[34px] self-stretch rounded-lg"
        >
          {hovered ? <TrashIcon size={15} /> : <StatusDot tone={tone} />}
        </Button>
      ) : (
        <View className="w-[34px] items-center justify-center">
          <StatusDot tone={tone} />
        </View>
      )}
    </View>
  );
}

/** Searchable chat list: the phone's Chats screen and the desktop sidebar. */
export const ChatList = forwardRef<
  TextInput,
  {
    selectedId?: string;
    onOpen: (id: Id<"sessions">) => void;
    onDelete: (id: Id<"sessions">, title: string) => void;
    dense?: boolean;
    bottomInset?: number;
  }
>(function ChatList({ selectedId, onOpen, onDelete, dense, bottomInset = 88 }, searchRef) {
  const sessions = useQuery(api.sessions.list);
  const { scope } = useProjectScope();
  const [search, setSearch] = useState("");
  const filtered = (sessions ?? []).filter(
    (row) =>
      !row.session.cwd && // Build Sessions (the only ones with a cwd) open from their Build, not this list.
      inProjectScope(row.session.projectId, scope) &&
      `${row.session.title} ${row.projectName}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <SearchBar
        ref={searchRef}
        accessibilityLabel="Search chats"
        placeholder="Search conversations…"
        value={search}
        onChangeText={setSearch}
        size={dense ? "sm" : "md"}
        variant={dense ? "filled" : "outline"}
        shape="rounded"
        panel="never"
        cancel="never"
        containerClassName={dense ? "mb-1" : "mx-4 mb-4 mt-3"}
      />
      <ScrollView
        contentContainerStyle={{ paddingBottom: bottomInset }}
        contentContainerClassName={dense ? "gap-px" : "gap-1 px-2"}
        keyboardShouldPersistTaps="handled"
      >
        {sessions === undefined ? (
          <View className="items-center py-6">
            <Spinner label="Loading chats" />
          </View>
        ) : !filtered.length ? (
          <EmptyState size="sm" className="flex-none items-start px-4 py-4">
            <EmptyState.Description className="text-left">
              {search
                ? "No conversations match your search."
                : "Start a conversation to work with an agent in a Project."}
            </EmptyState.Description>
          </EmptyState>
        ) : (
          filtered.map((row) => (
            <ChatRow
              key={row.session._id}
              title={row.session.title}
              provider={row.session.provider}
              projectName={scope.kind === "viewAll" ? row.projectName : undefined}
              status={row.session.status}
              selected={row.session._id === selectedId}
              dense={dense}
              onOpen={() => onOpen(row.session._id)}
              onDelete={() => onDelete(row.session._id, row.session.title)}
            />
          ))
        )}
      </ScrollView>
    </>
  );
});
