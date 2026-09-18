import { useMutation } from "convex/react";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SymbolView } from "expo-symbols";
import { api } from "@/lib/api";
import { Fonts } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  activitySummary,
  activityTitle,
  permissionLabel,
  permissionVariant,
  selectedPermissionLabel,
  type ActivityMessage,
  type PermissionVariant,
} from "./activity";
import { Notice } from "./ui";

const statusIcon = {
  check: { ios: "checkmark", android: "check", web: "check" },
  close: { ios: "xmark", android: "close", web: "close" },
  down: { ios: "chevron.down", android: "expand_more", web: "expand_more" },
  up: { ios: "chevron.up", android: "expand_less", web: "expand_less" },
} as const;

export function ActivityRow({
  message,
  sessionId,
}: {
  message: ActivityMessage;
  sessionId: Id<"sessions">;
}) {
  const theme = useTheme();
  const pendingChoice = message.kind === "permission" && message.status === "pending" && !message.decision;
  const [expanded, setExpanded] = useState(pendingChoice);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const resolve = useMutation(api.sessions.resolvePermission);
  const title = activityTitle(message);
  const summary = activitySummary(message);
  const body = (message.detail || message.text || "").trim();
  const failed = message.status === "failed" || message.status === "denied";
  const running = message.status === "inProgress" || message.status === "pending";
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
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={title}
        onPress={() => setExpanded((open) => !open)}
        style={({ pressed }) => [styles.header, { opacity: pressed ? 0.7 : 1 }]}
      >
        <View style={styles.status}>
          {running ? (
            <ActivityIndicator size="small" color={theme.accent} />
          ) : (
            <SymbolView
              name={failed ? statusIcon.close : statusIcon.check}
              size={14}
              tintColor={failed ? theme.danger : theme.textSecondary}
            />
          )}
        </View>
        <View style={styles.titles}>
          <Text
            numberOfLines={2}
            style={{
              color: failed ? theme.danger : theme.text,
              fontSize: 14,
              fontWeight: "500",
              lineHeight: 20,
            }}
          >
            {title}
          </Text>
          {summary && !expanded ? (
            <Text
              numberOfLines={1}
              style={{ color: theme.textSecondary, fontSize: 12, lineHeight: 16 }}
            >
              {summary}
            </Text>
          ) : null}
          {choice && !pendingChoice ? (
            <Text style={{ color: theme.textSecondary, fontSize: 12, lineHeight: 16 }}>
              {choice}
            </Text>
          ) : null}
        </View>
        <SymbolView
          name={expanded ? statusIcon.up : statusIcon.down}
          size={16}
          tintColor={theme.textSecondary}
        />
      </Pressable>
      {expanded && body !== "" ? (
        <Text selectable style={[styles.code, { color: theme.textSecondary }]}>
          {body}
        </Text>
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
          transform: [{ scale: pressed && !disabled ? 0.98 : 1 }],
        },
      ]}
    >
      <Text style={{ color, fontSize: 15, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 32,
  },
  status: {
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  titles: { flex: 1, gap: 2, minWidth: 0 },
  code: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    lineHeight: 18,
    paddingLeft: 28,
    paddingBottom: 4,
  },
  choices: { gap: 8, paddingLeft: 28, paddingBottom: 4 },
  choice: {
    minHeight: 44,
    borderRadius: 12,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
});
