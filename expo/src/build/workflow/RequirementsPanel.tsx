import { View } from "react-native";
import { Text } from "panelui-native/primitives/text";
import type { WorkflowState } from "../../../../shared/buildWorkflow";
import { Panel } from "./shared";

export function RequirementsPanel({ workflow }: { workflow: WorkflowState }) {
  return (
    <Panel title="Requirements">
      {workflow.requirements.map((requirement) => {
        const evidence = workflow.reports.verifier?.requirements.find(
          (item) => item.requirementId === requirement.id,
        );
        return (
          <View key={requirement.id} className="gap-1">
            <Text className="text-sm leading-5 text-foreground">
              {evidence ? (evidence.pass ? "✓ " : "× ") : "○ "}
              {requirement.text}
            </Text>
            {evidence && (
              <Text
                className={`text-xs leading-5 ${evidence.pass ? "text-muted-foreground" : "text-destructive"}`}
              >
                {evidence.evidence}
              </Text>
            )}
          </View>
        );
      })}
    </Panel>
  );
}
