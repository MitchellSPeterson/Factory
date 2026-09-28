import { useState } from "react";
import { Image, View } from "react-native";
import { Text } from "panelui-native/primitives/text";

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
  const url = projectPictureUrl(githubRepo ?? "");
  const [failed, setFailed] = useState(false);
  const letter = name?.trim()[0]?.toUpperCase() ?? "";
  const box = { width: size, height: size, borderRadius: Math.round(size / 4) };
  if (url && !failed) {
    return (
      <Image
        accessible={false}
        accessibilityIgnoresInvertColors
        source={{ uri: url }}
        onError={() => setFailed(true)}
        className="bg-muted"
        style={box}
      />
    );
  }
  return (
    <View accessible={false} className="items-center justify-center bg-muted" style={box}>
      {letter ? (
        <Text className="font-semibold text-foreground" style={{ fontSize: Math.round(size * 0.5), lineHeight: size }}>
          {letter}
        </Text>
      ) : null}
    </View>
  );
}
