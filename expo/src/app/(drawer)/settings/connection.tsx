import { useRouter } from 'expo-router';

import { useConnection } from '@/lib/factory';
import { PairingScreen } from '@/settings/pairing-screen';

export default function ConnectionPage() {
  const router = useRouter();
  const { setPairing } = useConnection();
  return (
    <PairingScreen
      onReady={(next) => {
        setPairing(next);
        router.back();
      }}
    />
  );
}
