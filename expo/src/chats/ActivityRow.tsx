import { useMutation } from "@/lib/factory";
import { useLayoutEffect, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SymbolView } from "expo-symbols";
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { api } from "@/lib/api";
import { Fonts } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import type { Id } from "@/lib/dataModel";
import {
  activitySummary,
  liveWorkLabel,
  permissionLabel,
  permissionVariant,
  selectedPermissionLabel,
  summarizeToolGroup,
  toolGroupAction,
  workRowLabel,
  type ActivityMessage,
  type PermissionVariant,
} from "./activity";
import { Notice } from "./ui";
import { ShimmeringWorkContent } from "./ShimmeringWorkContent";

const DISCLOSURE_MS = 180;
const DETAIL_ENTER = FadeIn.duration(140);
const DETAIL_EXIT = FadeOut.duration(120);
const ROW_LAYOUT = LinearTransition.duration(DISCLOSURE_MS);

const statusIcon = {
  close: { ios: "xmark", android: "close", web: "close" },
  down: { ios: "chevron.down", android: "expand_more", web: "expand_more" },
  right: { ios: "chevron.right", android: "chevron_right", web: "chevron_right" },
} as const;

const toolIcons = {
  read: { ios: "eye", android: "visibility", web: "visibility" },
  edit: { ios: "square.and.pencil", android: "edit", web: "edit" },
  command: { ios: "terminal", android: "terminal", web: "terminal" },
  search: { ios: "magnifyingglass", android: "search", web: "search" },
  other: { ios: "wrench", android: "build", web: "build" },
  mixed: { ios: "hammer", android: "construction", web: "construction" },
  think: { ios: "brain", android: "psychology", web: "psychology" },
} as const;

type WorkIcon = keyof typeof toolIcons;

function iconForMessage(message: ActivityMessage): WorkIcon {
  if (message.kind === "reasoning") return "think";
  return toolGroupAction([message]) === "mixed" ? "other" : toolGroupAction([message]);
}

function DisclosureChevron({
  expanded,
  color,
  from = "down",
}: {
  expanded: boolean;
  color: string;
  from?: "down" | "right";
}) {
  const expandedAngle = from === "right" ? 90 : 180;
  const rotation = useSharedValue(expanded ? expandedAngle : 0);
  useLayoutEffect(() => {
    rotation.set(
      withTiming(expanded ? expandedAngle : 0, {
        duration: DISCLOSURE_MS,
        reduceMotion: ReduceMotion.System,
      }),
    );
  }, [expanded, expandedAngle, rotation]);
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.get()}deg` }],
  }));
  return (
    <Animated.View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[{ width: 16, height: 16 }, style]}
    >
      <SymbolView
        name={from === "right" ? statusIcon.right : statusIcon.down}
        size={11}
        tintColor={color}
      />
    </Animated.View>
  );
}

function WorkIconView({
  icon,
  color,
}: {
  icon: WorkIcon;
  color: string;
}) {
  return (
    <View style={styles.iconSlot}>
      <SymbolView name={toolIcons[icon]} size={14} tintColor={color} />
    </View>
  );
}

function WorkLine({
  icon,
  label,
  color,
  iconColor,
}: {
  icon: WorkIcon;
  label: string;
  color: string;
  iconColor: string;
}) {
  return (
    <View style={styles.line}>
      <WorkIconView icon={icon} color={iconColor} />
      <Text numberOfLines={1} style={[styles.label, { color }]}>
        {label}
      </Text>
    </View>
  );
}

function WorkHeader({
  icon,
  label,
  live,
  failed,
  expanded,
  expandable,
  chevronFrom = "down",
  onPress,
}: {
  icon: WorkIcon;
  label: string;
  live: boolean;
  failed: boolean;
  expanded: boolean;
  expandable: boolean;
  chevronFrom?: "down" | "right";
  onPress?: () => void;
}) {
  const theme = useTheme();
  const muted = failed ? theme.danger : theme.textSecondary;
  const highlight = failed ? theme.danger : theme.text;
  const body = live ? (
    <ShimmeringWorkContent>
      {({ highlighted }) => (
        <WorkLine
          icon={icon}
          label={label}
          color={highlighted ? highlight : muted}
          iconColor={highlighted ? highlight : muted}
        />
      )}
    </ShimmeringWorkContent>
  ) : (
    <View style={styles.grow}>
      <WorkLine icon={icon} label={label} color={muted} iconColor={muted} />
    </View>
  );
  const inner = (
    <>
      {body}
      {failed && !live ? (
        <SymbolView name={statusIcon.close} size={11} tintColor={theme.danger} />
      ) : null}
      {expandable ? (
        <DisclosureChevron expanded={expanded} color={theme.textSecondary} from={chevronFrom} />
      ) : null}
    </>
  );
  if (!expandable && !onPress) {
    return <View style={styles.header}>{inner}</View>;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={expandable ? { expanded } : undefined}
      accessibilityLabel={failed ? `${label}, tool call failed` : label}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        styles.header,
        { backgroundColor: pressed ? theme.subtleHover : "transparent" },
      ]}
    >
      {inner}
    </Pressable>
  );
}

function WorkDetail({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <Animated.View
      entering={DETAIL_ENTER}
      exiting={DETAIL_EXIT}
      layout={ROW_LAYOUT}
      style={[styles.detail, { borderLeftColor: theme.lineStrong }]}
    >
      {children}
    </Animated.View>
  );
}

export function ThinkingRow() {
  const theme = useTheme();
  return (
    <View accessible accessibilityLabel="Thinking" style={styles.header}>
      <ShimmeringWorkContent>
        {({ highlighted }) => (
          <WorkLine
            icon="think"
            label="Thinking"
            color={highlighted ? theme.text : theme.textSecondary}
            iconColor={highlighted ? theme.text : theme.textSecondary}
          />
        )}
      </ShimmeringWorkContent>
    </View>
  );
}

function ReasoningRow({
  message,
  streaming,
}: {
  message: ActivityMessage;
  streaming: boolean;
}) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const body = (message.detail || message.text || "").trim();
  const expandable = body !== "";
  return (
    <Animated.View layout={ROW_LAYOUT}>
      <WorkHeader
        icon="think"
        label={streaming ? "Thinking" : workRowLabel(message)}
        live={streaming}
        failed={false}
        expanded={expanded}
        expandable={expandable}
        chevronFrom="right"
        onPress={expandable ? () => setExpanded((open) => !open) : undefined}
      />
      {expanded && expandable ? (
        <WorkDetail>
          <View style={[styles.thought, { backgroundColor: theme.subtleHover }]}>
            <Text selectable style={[styles.code, { color: theme.textSecondary, paddingLeft: 0 }]}>
              {body}
            </Text>
          </View>
        </WorkDetail>
      ) : null}
    </Animated.View>
  );
}

function ToolRow({
  message,
  live,
}: {
  message: ActivityMessage;
  live: boolean;
}) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const body = (message.detail || message.text || "").trim();
  const failed = message.status === "failed";
  const expandable = body !== "" && body !== workRowLabel(message);
  return (
    <Animated.View layout={ROW_LAYOUT}>
      <WorkHeader
        icon={iconForMessage(message)}
        label={workRowLabel(message)}
        live={live && !expanded}
        failed={failed}
        expanded={expanded}
        expandable={expandable}
        onPress={expandable ? () => setExpanded((open) => !open) : undefined}
      />
      {expanded && expandable ? (
        <WorkDetail>
          <Text selectable style={[styles.code, { color: theme.textSecondary }]}>
            {body}
          </Text>
        </WorkDetail>
      ) : null}
    </Animated.View>
  );
}

function rowKey(message: ActivityMessage & { _id?: string }, index: number): string {
  return message._id ?? message.requestId ?? `work-${index}`;
}

export function WorkGroup({
  messages,
  live,
  sessionLive,
}: {
  messages: readonly (ActivityMessage & { _id?: string })[];
  live: boolean;
  sessionLive: boolean;
}) {
  const tools = messages.filter((message) => message.kind === "tool");
  const [expanded, setExpanded] = useState(false);
  if (tools.length === 0) {
    return (
      <View style={styles.stack}>
        {messages.map((message, index) => (
          <ReasoningRow
            key={rowKey(message, index)}
            message={message}
            streaming={sessionLive}
          />
        ))}
      </View>
    );
  }
  if (messages.length === 1 && tools[0]) {
    return <ToolRow message={tools[0]} live={live} />;
  }
  const failed = tools.some((message) => message.status === "failed");
  const label = live ? liveWorkLabel(messages) : summarizeToolGroup(messages);
  const action = toolGroupAction(messages);
  return (
    <View style={styles.stack}>
      <WorkHeader
        icon={action}
        label={label}
        live={live && !expanded}
        failed={failed}
        expanded={expanded}
        expandable
        onPress={() => setExpanded((open) => !open)}
      />
      {expanded
        ? messages.map((message, index) =>
            message.kind === "reasoning" ? (
              <ReasoningRow
                key={rowKey(message, index)}
                message={message}
                streaming={false}
              />
            ) : (
              <ToolRow
                key={rowKey(message, index)}
                message={message}
                live={live && message.status === "inProgress"}
              />
            ),
          )
        : null}
    </View>
  );
}

export function ActivityRow({
  message,
  sessionId,
  canResolve,
}: {
  message: ActivityMessage;
  sessionId: Id<"sessions">;
  canResolve: boolean;
}) {
  const theme = useTheme();
  const pendingChoice =
    canResolve && message.kind === "permission" && message.status === "pending" && !message.decision;
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const resolve = useMutation(api.sessions.resolvePermission);
  const title = workRowLabel(message);
  const summary = activitySummary(message);
  const failed =
    message.status === "failed" ||
    message.status === "denied" ||
    (message.kind === "permission" && message.status === "pending" && !canResolve);
  const choice = selectedPermissionLabel(message);

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: pendingChoice ? theme.accent : theme.line,
        },
      ]}
    >
      <Text
        style={{
          color: theme.textSecondary,
          fontSize: 11,
          fontWeight: "700",
          letterSpacing: 1.1,
          textTransform: "uppercase",
        }}
      >
        Approval needed
      </Text>
      <Text
        style={{
          color: failed ? theme.danger : theme.text,
          fontSize: 17,
          fontWeight: "700",
          lineHeight: 22,
        }}
      >
        {title}
      </Text>
      {summary ? (
        <Text style={{ color: theme.textSecondary, fontSize: 14, lineHeight: 20 }}>{summary}</Text>
      ) : null}
      {choice && !pendingChoice ? (
        <Text style={{ color: theme.textSecondary, fontSize: 13 }}>{choice}</Text>
      ) : null}
      {pendingChoice && message.options?.length ? (
        <View style={styles.choices}>
          {message.options.map((option) => (
            <ChoiceButton
              key={option.optionId}
              label={permissionLabel(option.name)}
              variant={permissionVariant(option)}
              disabled={pending}
              onPress={() => {
                if (!message.requestId) return;
                setPending(true);
                setError("");
                void resolve({
                  sessionId,
                  requestId: message.requestId,
                  optionId: option.optionId,
                })
                  .catch((e) => setError(e instanceof Error ? e.message : String(e)))
                  .finally(() => setPending(false));
              }}
            />
          ))}
        </View>
      ) : null}
      {error ? <Notice text={error} error /> : null}
    </View>
  );
}

function ChoiceButton({
  label,
  variant,
  disabled,
  onPress,
}: {
  label: string;
  variant: PermissionVariant;
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const fill =
    variant === "allow-always"
      ? theme.text
      : variant === "reject"
        ? "transparent"
        : theme.subtleHover;
  const color =
    variant === "allow-always" ? theme.sidebar : variant === "reject" ? theme.danger : theme.text;
  const border = variant === "allow-always" ? "transparent" : theme.lineStrong;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        {
          backgroundColor: fill,
          borderColor: border,
          opacity: disabled ? 0.5 : pressed ? 0.82 : 1,
          transform: [{ scale: pressed && !disabled ? 0.97 : 1 }],
        },
      ]}
    >
      <Text style={{ color, fontSize: 15, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 2,
    borderRadius: 8,
    borderCurve: "continuous",
  },
  stack: { gap: 1 },
  grow: { flex: 1, minWidth: 0 },
  line: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
    flexShrink: 1,
  },
  iconSlot: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 14,
    lineHeight: 20,
    flexShrink: 1,
  },
  detail: {
    marginLeft: 28,
    borderLeftWidth: StyleSheet.hairlineWidth,
    paddingLeft: 12,
    paddingBottom: 4,
    paddingTop: 2,
  },
  thought: {
    borderRadius: 12,
    borderCurve: "continuous",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  code: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    lineHeight: 18,
  },
  card: {
    borderRadius: 20,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 10,
  },
  choices: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingTop: 4,
  },
  choice: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
});
