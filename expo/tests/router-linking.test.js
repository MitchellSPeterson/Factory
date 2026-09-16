import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// Run the installed hook with commit effects under test control so an initial
// URL can resolve while React's first render is suspended or abandoned.
function renderLinking(getInitialURL) {
  const effects = [];
  const reported = [];
  const exports = {};
  const modules = {
    react: {
      useRef: (current) => ({ current }),
      useCallback: (callback) => callback,
      useEffect: (effect) => effects.push(effect),
    },
    'expo-linking': {},
    'react-native': {},
    './extractPathFromURL': { extractExpoPathFromURL: (_prefixes, url) => url.replace('vasa://', '/') },
    '../react-navigation/native': {
      useNavigationIndependentTree: () => false,
      getStateFromPath: (path) => ({ path }),
    },
  };
  runInNewContext(
    readFileSync(new URL('../node_modules/expo-router/build/fork/useLinking.native.js', import.meta.url), 'utf8'),
    {
      exports,
      require: (name) => {
        if (!(name in modules)) throw new Error(`Unexpected import: ${name}`);
        return modules[name];
      },
      process: { env: { NODE_ENV: 'test' } },
      console,
    },
  );
  const hook = exports.useLinking({ current: null }, {
    prefixes: ['vasa://'],
    getInitialURL,
    subscribe: () => () => {},
  }, (path) => reported.push(path));
  return {
    ...hook,
    reported,
    commit: () => {
      const cleanups = effects.map((effect) => effect());
      return () => cleanups.forEach((cleanup) => cleanup?.());
    },
  };
}

test('initial URL resolving before commit queues its state update until mount', async () => {
  const hook = renderLinking(() => Promise.resolve('vasa://devices'));
  expect(await hook.getInitialState()).toEqual({ path: '/devices' });
  expect(hook.reported).toEqual([]);
  const unmount = hook.commit();
  expect(hook.reported).toEqual(['/devices']);
  unmount();
});

test('synchronous initial URLs also wait for commit', async () => {
  const hook = renderLinking(() => 'vasa://devices');
  expect(await hook.getInitialState()).toEqual({ path: '/devices' });
  expect(hook.reported).toEqual([]);
  const unmount = hook.commit();
  expect(hook.reported).toEqual(['/devices']);
  unmount();
});

test('an initial URL resolving after unmount cannot update state', async () => {
  const url = Promise.withResolvers();
  const hook = renderLinking(() => url.promise);
  const state = hook.getInitialState();
  const unmount = hook.commit();
  unmount();
  url.resolve('vasa://devices');
  await state;
  expect(hook.reported).toEqual([]);
});

test('an initial URL resolving after mount still reports the deep link', async () => {
  const url = Promise.withResolvers();
  const hook = renderLinking(() => url.promise);
  const state = hook.getInitialState();
  const unmount = hook.commit();
  url.resolve('vasa://devices');
  expect(await state).toEqual({ path: '/devices' });
  expect(hook.reported).toEqual(['/devices']);
  unmount();
});
