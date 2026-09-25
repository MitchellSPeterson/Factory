import { SymbolView } from "expo-symbols";
import { forwardRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, {
  css,
  cubicBezier,
  useReducedMotion,
} from "react-native-reanimated";
import { useQuery } from "@/lib/factory";
import type { Id } from "@/lib/dataModel";
import { api } from "@/lib/api";
import { inProjectScope } from "@/lib/project-scope";
import { useProjectScope } from "@/lib/project-scope-context";
import { useTheme } from "@/hooks/use-theme";
import { ProviderMark } from "@/chats/model-picker";
import { IconNames } from "@/components/icon-button";

const pulse = css.keyframes({
  "0%, 100%": { opacity: 1 },
  "50%": { opacity: 0.55 },
});
const motion = css.create({
  pulse: {
    animationName: pulse,
    animationDuration: "1.6s",
    animationTimingFunction: cubicBezier(0.77, 0, 0.175, 1),
    animationIterationCount: "infinite",
  },
});

function StatusDot({ color, running }: { color: string; running: boolean }) {
  const reduced = useReducedMotion();
  return (
    <Animated.View
      style={[
        styles.dot,
        { backgroundColor: color },
        running && !reduced ? motion.pulse : null,
      ]}
    />
  );
}

function ChatRow({
  title,
  projectName,
  provider,
  status,
  selected,
  statusColor,
  dense,
  onOpen,
  onDelete,
}: {
  title: string;
  projectName?: string;
  provider: "codex" | "cursor" | "grok" | "claude" | "openai";
  status: string;
  selected: boolean;
  statusColor: string;
  dense?: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const theme = useTheme();
  // RN-web ends a Pressable's hover when a nested Pressable is entered, so the
  // two sibling buttons report hover themselves (web forbids nested <button>s).
  const [hovered, setHovered] = useState(false);
  const hover = {
    onHoverIn: () => setHovered(true),
    onHoverOut: () => setHovered(false),
  };
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        borderRadius: dense ? 8 : 12,
        borderCurve: "continuous",
        backgroundColor: selected
          ? theme.backgroundSelected
          : hovered
            ? theme.subtleHover
            : "transparent",
      }}
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
        style={({ pressed }) => [
          dense ? styles.rowDense : styles.row,
          pressed && !selected && { backgroundColor: theme.subtleHover },
        ]}
      >
        <ProviderMark provider={provider} size={dense ? 16 : 18} />
        <View style={styles.rowCopy}>
          <Text
            numberOfLines={dense ? 1 : 2}
            style={[
              dense ? styles.rowTitleDense : styles.rowTitle,
              { color: theme.text },
            ]}
          >
            {title}
          </Text>
          {projectName ? (
            <Text
              numberOfLines={1}
              style={[styles.projectName, { color: theme.textSecondary }]}
            >
              {projectName}
            </Text>
          ) : null}
        </View>
      </Pressable>
      {dense ? (
        <Pressable
          {...hover}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${title}`}
          onPress={onDelete}
          style={styles.trailing}
        >
          {hovered ? (
            <SymbolView
              name={IconNames.trash}
              size={15}
              tintColor={theme.textSecondary}
            />
          ) : (
            <StatusDot color={statusColor} running={status === "running"} />
          )}
        </Pressable>
      ) : (
        <View style={styles.trailing}>
          <StatusDot color={statusColor} running={status === "running"} />
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
  const theme = useTheme();
  const sessions = useQuery(api.sessions.list);
  const { scope } = useProjectScope();
  const [search, setSearch] = useState("");
  const filtered = (sessions ?? []).filter(
    (row) =>
      inProjectScope(row.session.projectId, scope) &&
      `${row.session.title} ${row.projectName}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <TextInput
        ref={searchRef}
        accessibilityLabel="Search chats"
        placeholder="Search conversations…"
        placeholderTextColor={theme.textSecondary}
        value={search}
        onChangeText={setSearch}
        style={[
          dense ? styles.searchDense : styles.search,
          {
            backgroundColor: theme.backgroundElement,
            color: theme.text,
            borderColor: theme.line,
          },
        ]}
      />
      <ScrollView
        contentContainerStyle={[
          dense ? styles.listDense : styles.list,
          { paddingBottom: bottomInset },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {sessions === undefined ? (
          <ActivityIndicator color={theme.accent} />
        ) : !filtered.length ? (
          <View style={styles.listEmpty}>
            <Text
              style={{ color: theme.textSecondary, fontSize: 14, lineHeight: 22 }}
            >
              {search
                ? "No conversations match your search."
                : "Start a conversation to work with an agent in a Project."}
            </Text>
          </View>
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
              statusColor={
                row.session.status === "running" ||
                row.session.status === "queued"
                  ? theme.accent
                  : row.session.status === "failed"
                    ? theme.danger
                    : theme.textSecondary
              }
              onOpen={() => onOpen(row.session._id)}
              onDelete={() => onDelete(row.session._id, row.session.title)}
            />
          ))
        )}
      </ScrollView>
    </>
  );
});

const styles = StyleSheet.create({
  search: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 16,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 13,
  },
  searchDense: {
    marginHorizontal: 0,
    marginBottom: 4,
    paddingHorizontal: 10,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 13,
  },
  list: { paddingHorizontal: 8, gap: 4 },
  listDense: { gap: 1 },
  listEmpty: { padding: 16, gap: 8 },
  row: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    paddingRight: 0,
    borderRadius: 12,
    borderCurve: "continuous",
  },
  rowDense: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderCurve: "continuous",
  },
  trailing: { width: 34, alignSelf: "stretch", alignItems: "center", justifyContent: "center" },
  rowCopy: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { fontSize: 14, fontWeight: "500", lineHeight: 20 },
  rowTitleDense: { fontSize: 13, lineHeight: 18 },
  projectName: { fontSize: 11 },
  dot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
});
