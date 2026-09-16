import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { type ReactNode } from 'react';

const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;

if (!convexUrl) {
  throw new Error('EXPO_PUBLIC_CONVEX_URL is not set.');
}

const convex = new ConvexReactClient(convexUrl, { unsavedChangesWarning: false });

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
