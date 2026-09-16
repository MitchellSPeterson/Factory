import { createElement } from 'react';

export function DeviceStream({ uri, name }: { uri: string; name: string }) {
  return createElement('img', {
    src: uri,
    alt: `${name} live stream`,
    draggable: false,
    style: {
      display: 'block',
      width: '100%',
      height: '100%',
      objectFit: 'fill',
      pointerEvents: 'none',
      userSelect: 'none',
    },
  });
}
