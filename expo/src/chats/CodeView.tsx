import { ScrollView } from "react-native";

import { Card } from "panelui-native/components/card";
import { Text } from "panelui-native/primitives/text";

// CodeBlock scrolls sideways only and its lines are not selectable, so a file
// stays plain monospace text inside the card.
export function CodeView({ text }: { path: string; text: string }) {
  return (
    <Card className="min-h-0 flex-1 overflow-hidden rounded-none border-0 bg-surface shadow-none">
      <ScrollView className="min-h-0 flex-1" contentContainerClassName="p-3 pb-12">
        <ScrollView horizontal>
          <Text selectable className="font-mono text-xs leading-[18px] text-foreground">
            {text}
          </Text>
        </ScrollView>
      </ScrollView>
    </Card>
  );
}
