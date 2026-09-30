import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "panelui-native/primitives/text";
import { WebView } from "react-native-webview";
import { isolatedArtifactHtml, type ArtifactPreviewProps } from "./artifacts";

export function ArtifactPreview({
  html,
  title,
  pinning,
  pins = [],
  onPin,
  onSelectPin,
}: ArtifactPreviewProps) {
  const source = useMemo(
    () => ({ html: isolatedArtifactHtml(html), baseUrl: "about:blank" }),
    [html],
  );
  const [size, setSize] = useState({ width: 1, height: 520 });
  return (
    <View
      accessibilityLabel={title}
      onLayout={(event) => setSize(event.nativeEvent.layout)}
      style={{
        height: 520,
        width: "100%",
        backgroundColor: "white",
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      <WebView
        source={source}
        // Route all requests through the callback; a failed whitelist opens external apps.
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled={false}
        incognito
        cacheEnabled={false}
        sharedCookiesEnabled={false}
        thirdPartyCookiesEnabled={false}
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        setSupportMultipleWindows={false}
        onShouldStartLoadWithRequest={(request) =>
          request.url === "about:blank"
        }
        style={{ flex: 1 }}
      />
      {pinning && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose a location for your comment"
          onPress={(event) =>
            onPin?.({
              x: Math.max(
                0,
                Math.min(1, event.nativeEvent.locationX / size.width),
              ),
              y: Math.max(
                0,
                Math.min(1, event.nativeEvent.locationY / size.height),
              ),
              viewportWidth: size.width,
              viewportHeight: size.height,
            })
          }
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "rgba(99,102,241,.07)",
          }}
        />
      )}
      {pins.map((pin, index) => (
        <Pressable
          key={pin.id}
          accessibilityRole="button"
          accessibilityLabel={`Comment ${index + 1}: ${pin.label}`}
          onPress={() => onSelectPin?.(pin.id)}
          style={{
            position: "absolute",
            left: pin.anchor.x * size.width - 14,
            top: pin.anchor.y * size.height - 14,
            width: 28,
            height: 28,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 14,
            backgroundColor: pin.resolved ? "#52525b" : "#6366f1",
            borderColor: "white",
            borderWidth: 2,
          }}
        >
          <Text style={{ color: "white", fontWeight: "600" }}>{index + 1}</Text>
        </Pressable>
      ))}
    </View>
  );
}
