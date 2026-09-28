import { View } from "react-native";
import { Text } from "panelui-native/primitives/text";
import { AGENT_EFFORTS, providerLabel } from "../../../shared/agentModel";
import type { AgentPick } from "../../../shared/helix";
import { PickerChip, effortLabel, modelTitle } from "@/chats/model-picker";
import { Popover } from "@/roadmap/Popover";

export type ChatModelOption = { provider: AgentPick["provider"]; model: string; title: string };

export function AgentPickField({
  label,
  value,
  onChange,
  models,
}: {
  label: string;
  value: AgentPick;
  onChange: (next: AgentPick) => void;
  models: ChatModelOption[];
}) {
  const current = models.find((m) => m.provider === value.provider && m.model === value.model);
  return (
    <View className="gap-1.5">
      <Text className="text-xs font-semibold text-muted-foreground">{label}</Text>
      <View className="flex-row flex-wrap gap-1.5">
        <Popover
          align="left"
          items={models.map((m) => ({
            label: `${m.title} · ${providerLabel(m.provider)}`,
            selected: m.provider === value.provider && m.model === value.model,
            onPress: () => onChange({ ...value, provider: m.provider, model: m.model }),
          }))}>
          {(open) => (
            <PickerChip label={current?.title ?? modelTitle(value.model)} icon={value.provider} open={false} onPress={open} />
          )}
        </Popover>
        <Popover
          align="left"
          items={AGENT_EFFORTS.map((effort) => ({
            label: effortLabel(effort),
            selected: effort === value.effort,
            onPress: () => onChange({ ...value, effort }),
          }))}>
          {(open) => <PickerChip label={effortLabel(value.effort)} open={false} onPress={open} />}
        </Popover>
      </View>
    </View>
  );
}
