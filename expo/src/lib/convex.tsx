import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { type ReactNode, useMemo, useState } from 'react';

import { PairingScreen } from '@/settings/pairing-screen';
import { readConvexUrl, writeConvexUrl } from '@/lib/convex-url';

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const [url, setUrl] = useState(readConvexUrl);
  const client = useMemo(
    () => (url ? new ConvexReactClient(url, { unsavedChangesWarning: false }) : null),
    [url],
  );
  if (!url || !client) {
    return (
      <PairingScreen
        onReady={(next) => {
          writeConvexUrl(next);
          setUrl(next);
        }}
      />
    );
  }
  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}
