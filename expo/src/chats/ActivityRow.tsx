import { useMutation } from "@/lib/factory";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Alert } from "panelui-native/components/alert";
import { Badge } from "panelui-native/components/badge";
import { Button } from "panelui-native/components/button";
import { Message } from "panelui-native/components/message";
import { Plan } from "panelui-native/components/plan";
import { Shimmer } from "panelui-native/components/shimmer";
import { ThinkingOrb } from "panelui-native/components/thinking-orb";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  EyeIcon,
  PencilIcon,
  SearchIcon,
  ShieldAlertIcon,
  SparklesIcon,
} from "panelui-native/icons";
import { Text } from "panelui-native/primitives/text";
import { api } from "@/lib/api";
import type { Id } from "@/lib/dataModel";
import {
  activitySummary,
  activityTitle,
  liveWorkLabel,
  permissionLabel,
  permissionVariant,
  selectedPermissionLabel,
  summarizeToolGroup,
  toolGroupAction,
  toolAction,
  workRowLabel,
  type ToolAction,
  type ActivityMessage,
  type PermissionVariant,
} from "./activity";

export function ThinkingRow() {
  return (
    <Message align="start" accessibilityLabel="Thinking">
      <Message.Avatar>
        <ThinkingOrb state="working" size={28} />
      </Message.Avatar>
      <Message.Content>
        <Shimmer textClassName="text-base">Thinking…</Shimmer>
      </Message.Content>
    </Message>
  );
}

function ActionIcon({ action }: { action: ToolAction | "thought" }) {
  if (action === "read") return <EyeIcon size={14} />;
  if (action === "edit") return <PencilIcon size={14} />;
  if (action === "search") return <SearchIcon size={14} />;
  if (action === "command") return <Text className="font-mono text-xs text-muted-foreground">{">_"}</Text>;
  return <SparklesIcon size={14} />;
}

// One quiet line per step (icon, muted label, chevron); tap to reveal the raw detail beneath a left rule.
function FlatRow({
  icon,
  label,
  detail,
  live = false,
  failed = false,
  defaultOpen = false,
}: {
  icon: ToolAction | "thought";
  label: string;
  detail?: string;
  live?: boolean;
  failed?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const expandable = !!detail && detail !== label;
  return (
    <View>
      <Pressable
        accessibilityRole={expandable ? "button" : undefined}
        accessibilityLabel={failed ? `${label}, failed` : label}
        accessibilityState={expandable ? { expanded: open } : undefined}
        disabled={!expandable}
        onPress={() => setOpen((value) => !value)}
        className="min-h-8 flex-row items-center gap-1.5 rounded-md px-0.5 active:bg-muted">
        <View className="h-6 w-6 items-center justify-center opacity-60">
          <ActionIcon action={icon} />
        </View>
        <View className="min-w-0 flex-1">
          {live && !open ? (
            <Shimmer textClassName="text-sm">{label}</Shimmer>
          ) : (
            <Text
              className={failed ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
              numberOfLines={open ? undefined : 1}>
              {label}
            </Text>
          )}
        </View>
        {expandable ? (
          <View className="opacity-60">
            {open ? <ChevronDownIcon size={11} /> : <ChevronRightIcon size={11} />}
          </View>
        ) : null}
      </Pressable>
      {open && detail ? (
        <View className="ml-7 border-l border-border pb-1 pl-3 pt-0.5">
          <ScrollView nestedScrollEnabled className="max-h-60">
            <Text selectable className="font-mono text-xs leading-normal text-muted-foreground">
              {detail}
            </Text>
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

function stepRow(message: ActivityMessage, live: boolean, sessionLive: boolean) {
  const body = (message.detail || message.text || "").trim();
  if (message.kind === "reasoning") {
    return (
      <FlatRow
        icon="thought"
        label={activityTitle(message)}
        detail={body}
        live={sessionLive && message.status === "inProgress"}
      />
    );
  }
  return (
    <FlatRow
      icon={toolAction(message)}
      label={workRowLabel(message)}
      detail={body}
      live={live}
      failed={message.status === "failed"}
      defaultOpen={message.status === "failed"}
    />
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
  const [open, setOpen] = useState(live);
  if (messages.length === 1) return stepRow(messages[0]!, live, sessionLive);
  const tools = messages.filter((message) => message.kind === "tool");
  const groupAction = toolGroupAction(messages);
  const groupIcon = !tools.length ? "thought" : groupAction === "mixed" ? "other" : groupAction;
  const failed = tools.some((message) => message.status === "failed");
  const label = live ? liveWorkLabel(messages) : summarizeToolGroup(messages);
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        className="min-h-8 flex-row items-center gap-1.5 rounded-md px-0.5 active:bg-muted">
        <View className="h-6 w-6 items-center justify-center opacity-60">
          <ActionIcon action={groupIcon} />
        </View>
        <View className="min-w-0 flex-1">
          {live ? (
            <Shimmer textClassName="text-sm">{label}</Shimmer>
          ) : (
            <Text
              className={failed ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
              numberOfLines={1}>
              {label}
            </Text>
          )}
        </View>
        <View className="opacity-60">
          {open ? <ChevronDownIcon size={11} /> : <ChevronRightIcon size={11} />}
        </View>
      </Pressable>
      {open ? (
        <View className="ml-2">
          {messages.map((message, index) => (
            <View key={rowKey(message, index)}>
              {stepRow(message, live && message.status === "inProgress", sessionLive)}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function choiceVariant(variant: PermissionVariant): "primary" | "outline" | "destructive" {
  if (variant === "allow-always") return "primary";
  if (variant === "reject") return "destructive";
  return "outline";
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
    <View className="gap-2">
      <Plan defaultOpen className={pendingChoice ? "border-primary" : undefined}>
        <Plan.Header>
          <Plan.Icon>
            <ShieldAlertIcon size={16} />
          </Plan.Icon>
          <Plan.Title className={failed ? "text-destructive" : undefined}>{title}</Plan.Title>
          {summary ? <Plan.Description>{summary}</Plan.Description> : null}
          <Plan.Action>
            <Badge variant={pendingChoice ? "warning" : failed ? "destructive" : "secondary"}>
              {pendingChoice ? "Approval" : failed ? "Closed" : "Approval"}
            </Badge>
          </Plan.Action>
        </Plan.Header>
        {choice && !pendingChoice ? (
          <Plan.Content>
            <Text className="text-sm text-muted-foreground">{choice}</Text>
          </Plan.Content>
        ) : null}
        {pendingChoice && message.options?.length ? (
          <Plan.Footer layout="stretch">
            {message.options.map((option) => (
              <Button
                key={option.optionId}
                variant={choiceVariant(permissionVariant(option))}
                disabled={pending}
                accessibilityLabel={permissionLabel(option.name)}
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
              >
                {permissionLabel(option.name)}
              </Button>
            ))}
          </Plan.Footer>
        ) : null}
      </Plan>
      {error ? (
        <Alert variant="destructive">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}
    </View>
  );
}
