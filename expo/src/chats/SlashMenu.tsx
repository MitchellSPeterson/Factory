import { ScrollView, useWindowDimensions } from "react-native";
import { SymbolView } from "expo-symbols";
import { useCSSVariable } from "uniwind";

import { Card } from "panelui-native/components/card";
import { Item } from "panelui-native/components/item";
import { CodeIcon } from "panelui-native/icons";
import { Text } from "panelui-native/primitives/text";

import type { SlashItem } from "./composerSlash";

const skillIcon = {
  ios: "person.crop.circle",
  android: "person",
  web: "person",
} as const;

export function SlashMenu({
  visible,
  items,
  onSelect,
}: {
  visible: boolean;
  items: readonly SlashItem[];
  onSelect: (item: SlashItem) => void;
}) {
  const { height } = useWindowDimensions();
  const foreground = useCSSVariable("--color-foreground") as string | undefined;
  if (!visible) return null;
  const maxHeight = Math.min(320, Math.round(height * 0.42));
  return (
    <Card className="mb-2 overflow-hidden" style={{ maxHeight }}>
      <Text className="px-3.5 pb-1.5 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Commands
      </Text>
      <ScrollView keyboardShouldPersistTaps="handled">
        {items.length === 0 ? (
          <Text className="px-3.5 pb-4 text-[13px] leading-5 text-muted-foreground">
            No matching command or Skill.
          </Text>
        ) : (
          items.map((item) => {
            const skill = item.kind === "skill";
            return (
              <Item
                key={skill ? `skill:${item.id}` : item.id}
                size="sm"
                accessibilityLabel={
                  skill ? `Skill ${item.slug}. ${item.description}` : `${item.name}. ${item.description}`
                }
                onPress={() => onSelect(item)}
                className="min-h-12 rounded-none bg-transparent px-3 py-2"
              >
                <Item.Media variant="icon" className="border-0 bg-surface">
                  {skill ? (
                    <SymbolView name={skillIcon} size={16} tintColor={foreground} />
                  ) : (
                    <CodeIcon size={16} color={foreground} />
                  )}
                </Item.Media>
                <Item.Content>
                  <Text numberOfLines={1} className="text-[15px]">
                    {skill ? (
                      <>
                        <Text className="text-[15px] font-semibold text-muted-foreground">skill:</Text>
                        <Text className="text-[15px] font-semibold text-foreground">{item.slug}</Text>
                      </>
                    ) : (
                      <Text className="text-[15px] font-semibold text-foreground">{item.name}</Text>
                    )}
                    <Text className="text-sm font-normal text-muted-foreground">{`  ${item.description}`}</Text>
                  </Text>
                </Item.Content>
              </Item>
            );
          })
        )}
      </ScrollView>
    </Card>
  );
}
