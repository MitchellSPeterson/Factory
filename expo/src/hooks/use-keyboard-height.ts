import { useEffect, useState } from "react";
import { Keyboard, LayoutAnimation, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { visibleKeyboardInset } from "@/lib/keyboardInset";

export function useKeyboardHeight(): number {
  const insets = useSafeAreaInsets();
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS === "web") return;
    const show = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (event) => {
        if (Platform.OS === "ios") {
          LayoutAnimation.configureNext({
            duration: event.duration > 0 ? event.duration : 250,
            update: { type: LayoutAnimation.Types.keyboard },
          });
        }
        setHeight(event.endCoordinates.height);
      },
    );
    const hide = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      (event) => {
        if (Platform.OS === "ios") {
          LayoutAnimation.configureNext({
            duration: event.duration > 0 ? event.duration : 250,
            update: { type: LayoutAnimation.Types.keyboard },
          });
        }
        setHeight(0);
      },
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visibleKeyboardInset({
    keyboardHeight: height,
    insetBottom: insets.bottom,
    platform: Platform.OS,
  });
}
