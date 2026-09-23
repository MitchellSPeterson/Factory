import { useState } from "react";
import { Image, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme";
import { projectPictureUrl } from "../../../shared/addProject";

export function ProjectPicture({
  githubRepo,
  name,
  size = 22,
}: {
  githubRepo?: string;
  name?: string;
  size?: number;
}) {
  const theme = useTheme();
  const url = projectPictureUrl(githubRepo ?? "");
  const [failed, setFailed] = useState(false);
  const letter = name?.trim()[0]?.toUpperCase() ?? "";
  if (url && !failed) {
    return (
      <Image
        accessible={false}
        accessibilityIgnoresInvertColors
        source={{ uri: url }}
        onError={() => setFailed(true)}
        style={[styles.image, { width: size, height: size, borderRadius: Math.round(size / 4) }]}
      />
    );
  }
  return (
    <View
      accessible={false}
      style={[
        styles.glyph,
        {
          width: size,
          height: size,
          borderRadius: Math.round(size / 4),
          backgroundColor: theme.subtleHover,
        },
      ]}>
      {letter ? (
        <ThemedText type="smallBold" style={{ fontSize: Math.round(size * 0.5), lineHeight: size }}>
          {letter}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  image: { borderCurve: "continuous" },
  glyph: {
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
});
