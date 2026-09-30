import { View } from "react-native";
import { Text } from "panelui-native/primitives/text";
import type { WorkflowState } from "../../../../shared/buildWorkflow";
import { Panel } from "./shared";

export function FindingsPanel({ workflow }: { workflow: WorkflowState }) {
  return (
    <Panel title="Findings">
      {workflow.findings.map((finding) => (
        <View
          key={finding.id}
          className="gap-1 rounded-xl border border-border p-3"
        >
          <Text
            className={`text-xs font-semibold ${finding.severity === "blocking" && !finding.resolved ? "text-destructive" : "text-muted-foreground"}`}
          >
            {finding.resolved
              ? "Resolved"
              : finding.severity === "blocking"
                ? "Blocking"
                : "Suggestion"}
            {finding.file
              ? ` · ${finding.file}${finding.line ? `:${finding.line}` : ""}`
              : ""}
          </Text>
          <Text className="text-sm leading-5 text-foreground">
            {finding.text}
          </Text>
          <Text selectable className="text-xs leading-5 text-muted-foreground">
            {finding.evidence}
          </Text>
          <Text className="text-xs leading-5 text-muted-foreground">
            {finding.impact}
          </Text>
        </View>
      ))}
    </Panel>
  );
}
