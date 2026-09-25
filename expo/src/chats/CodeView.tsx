import { ScrollView, StyleSheet, Text } from "react-native";

import { Fonts } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

// Native fallback: no syntax highlighting lib here, just the plain selectable
// monospace text FilesPanel used to render inline.
export function CodeView({ text }: { path: string; text: string }) {
  const theme = useTheme();
  return (
    <ScrollView contentContainerStyle={styles.body}>
      <ScrollView horizontal>
        <Text selectable style={[styles.code, { color: theme.text }]}>
          {text}
        </Text>
      </ScrollView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 12, paddingBottom: 48 },
  code: { fontFamily: Fonts?.mono, fontSize: 12, lineHeight: 18 },
});
