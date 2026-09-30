import { useState } from "react";
import { View } from "react-native";
import { Text } from "panelui-native/primitives/text";
import { DEFAULT_PERMISSION_MODE, DEFAULT_SERVICE_TIER } from "../../../shared/validators";
import type { AgentPick } from "../../../shared/helix";
import { ModelMenu, PickerChip, effortLabel, modelTitle } from "@/chats/model-picker";

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
  const [open, setOpen] = useState(false);
  const current = models.find((m) => m.provider === value.provider && m.model === value.model);
  return (
    <View className="gap-1.5">
      <Text className="text-xs font-semibold text-muted-foreground">{label}</Text>
      <View className="flex-row">
        <PickerChip
          label={`${current?.title ?? modelTitle(value.model)} · ${effortLabel(value.effort)}`}
          icon={value.provider}
          open={open}
          onPress={() => setOpen(!open)}
        />
      </View>
      <ModelMenu
        visible={open}
        optionIds={["effort"]}
        current={{
          ...value,
          permissionMode: DEFAULT_PERMISSION_MODE,
          serviceTier: DEFAULT_SERVICE_TIER,
        }}
        onChange={(next) => onChange({ provider: next.provider, model: next.model, effort: next.effort })}
      />
    </View>
  );
}
