import { useState } from "react";
import { Pressable, View } from "react-native";
import { Button } from "panelui-native/components/button";
import { Text } from "panelui-native/primitives/text";
import { Notice } from "@/chats/ui";
import { ROLE_LABEL } from "../BuildSettings";
import type { WorkflowReport } from "../../../../shared/buildWorkflow";
import { Panel } from "./shared";

export function ReportView({
  report,
  currentRevision,
  onOpenSession,
}: {
  report: WorkflowReport;
  currentRevision?: string;
  onOpenSession: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Panel title={`${ROLE_LABEL[report.role]} report`}>
      <View className="gap-2 rounded-xl border border-border p-3">
        <Text className="text-xs font-mono text-muted-foreground">
          Candidate {report.revision}
          {report.revision !== currentRevision ? " · Earlier evidence" : ""}
        </Text>
        {!!report.environmentBlocker && (
          <Notice text={report.environmentBlocker} error />
        )}
        {report.productChanged && (
          <Notice
            text="Product code changed during review. This report cannot approve the Candidate."
            error
          />
        )}
        {report.sessionId && (
          <Pressable
            onPress={() => onOpenSession(report.sessionId!)}
            accessibilityRole="button"
          >
            <Text className="text-xs text-primary">Open preserved Session</Text>
          </Pressable>
        )}
        <Button
          variant="ghost"
          className="self-start"
          onPress={() => setExpanded(!expanded)}
        >
          {expanded
            ? "Hide executed checks"
            : `${report.checks.length} executed checks`}
        </Button>
        {expanded &&
          report.checks.map((check, index) => (
            <View key={index} className="gap-1 rounded-lg bg-background p-3">
              <Text selectable className="text-xs font-mono text-foreground">
                {check.command}
              </Text>
              <Text
                className={`text-xs ${check.exitCode === 0 ? "text-success" : "text-destructive"}`}
              >
                Exit {check.exitCode} ·{" "}
                {new Date(check.executedAt).toLocaleString()}
              </Text>
              <Text
                selectable
                className="text-xs font-mono leading-5 text-muted-foreground"
              >
                {check.output || "No output"}
              </Text>
            </View>
          ))}
      </View>
    </Panel>
  );
}
