import { useMutation } from "@/lib/factory";
import { useState } from "react";
import { View } from "react-native";
import { Alert } from "panelui-native/components/alert";
import { Badge } from "panelui-native/components/badge";
import { Button } from "panelui-native/components/button";
import { CodeBlock } from "panelui-native/components/code-block";
import { Message } from "panelui-native/components/message";
import { Plan } from "panelui-native/components/plan";
import { Reasoning } from "panelui-native/components/reasoning";
import { Shimmer } from "panelui-native/components/shimmer";
import { Task, type TaskStatus } from "panelui-native/components/task";
import { ThinkingOrb } from "panelui-native/components/thinking-orb";
import { ShieldAlertIcon } from "panelui-native/icons";
import { Text } from "panelui-native/primitives/text";
import { api } from "@/lib/api";
import type { Id } from "@/lib/dataModel";
import {
  activitySummary,
  liveWorkLabel,
  permissionLabel,
  permissionVariant,
  selectedPermissionLabel,
  summarizeToolGroup,
  workRowLabel,
  type ActivityMessage,
  type PermissionVariant,
} from "./activity";

function taskStatus(message: ActivityMessage, live: boolean): TaskStatus {
  if (message.status === "failed") return "error";
  if (live || message.status === "inProgress") return "running";
  if (message.status === "pending") return "pending";
  return "complete";
}

function WorkDetail({ body }: { body: string }) {
  if (!body.includes("\n")) return <Task.Item>{body}</Task.Item>;
  return (
    <CodeBlock code={body}>
      <CodeBlock.Header>
        <CodeBlock.Language>output</CodeBlock.Language>
        <CodeBlock.CopyButton />
      </CodeBlock.Header>
    </CodeBlock>
  );
}

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

function ReasoningRow({
  message,
  streaming,
}: {
  message: ActivityMessage;
  streaming: boolean;
}) {
  const body = (message.detail || message.text || "").trim();
  return (
    <Reasoning isStreaming={streaming && body !== ""}>
      <Reasoning.Trigger />
      {body ? <Reasoning.Content>{body}</Reasoning.Content> : null}
    </Reasoning>
  );
}

function ToolRow({
  message,
  live,
}: {
  message: ActivityMessage;
  live: boolean;
}) {
  const body = (message.detail || message.text || "").trim();
  const label = workRowLabel(message);
  const expandable = body !== "" && body !== label;
  const status = taskStatus(message, live);
  return (
    <Task status={status} defaultOpen={status === "running" || status === "error"}>
      <Task.Trigger title={label} />
      {expandable ? (
        <Task.Content>
          <WorkDetail body={body} />
        </Task.Content>
      ) : null}
    </Task>
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
  if (tools.length === 0) {
    return (
      <View className="gap-2">
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
  const running = live || tools.some((message) => message.status === "inProgress");
  return (
    <Task
      status={failed ? "error" : running ? "running" : "complete"}
      defaultOpen={running || failed}
    >
      <Task.Trigger title={label} />
      <Task.Content>
        <View className="gap-2">
          {messages.map((message, index) =>
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
          )}
        </View>
      </Task.Content>
    </Task>
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
