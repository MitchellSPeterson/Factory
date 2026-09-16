# Expo Hub client

Vendored from https://github.com/expo/expo-device-hub at `3d13723ab8951a693cdd693b6f453b84880e2aaa`.
MIT license; see LICENSE.

Local adaptation: `useIosDevice` anchors proxied helper URLs to the configured middleware endpoint. An inline native WebView can have an `about:blank` page address even when its document base points at Device Hub.

Used only by the isolated stream renderer. Native VASA controls communicate through the typed bridge.
Rebuild the renderer with `bun run build:device-stream` at the repository root after updates.
