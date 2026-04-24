// Bun plugin: replace react-devtools-core (and ink's optional devtools loader)
// with a tiny no-op stub so we don't bloat the bundle/binary with ~15MB of
// devtools code that's only ever loaded when DEV=true.
import type { BunPlugin } from 'bun';

export const stubDevtools: BunPlugin = {
  name: 'stub-devtools',
  setup(build) {
    build.onResolve({ filter: /^react-devtools-core$/ }, () => ({
      path: 'react-devtools-core',
      namespace: 'stub',
    }));
    build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: 'export default {connectToDevTools(){}};',
      loader: 'js',
    }));
  },
};
