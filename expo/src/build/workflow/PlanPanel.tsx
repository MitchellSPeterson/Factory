import { View } from "react-native";
import { Text } from "panelui-native/primitives/text";
import type { WorkflowState } from "../../../../shared/buildWorkflow";
import { Panel } from "./shared";

export function PlanPanel({ workflow }: { workflow: WorkflowState }) {
  return (
    <Panel title="Implementation plan">
      {workflow.plan.map((checkpoint, index) => (
        <View key={index} className="gap-1 rounded-xl border border-border p-3">
          <Text className="text-sm font-medium text-foreground">
            {index + 1}. {checkpoint.title}
          </Text>
          <Text className="text-xs leading-5 text-muted-foreground">
            {checkpoint.description}
          </Text>
        </View>
      ))}
      <Text className="text-xs text-muted-foreground">
        Checkpoints organize one complete Candidate. Planning proceeds
        automatically.
      </Text>
    </Panel>
  );
}
