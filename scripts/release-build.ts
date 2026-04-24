import { stubDevtools } from './stub-devtools.ts';
import { mkdirSync } from 'node:fs';

// Cross-compile a standalone binary for every supported platform. Used by
// the release workflow; output names match what the Homebrew formula expects.
const TARGETS = [
  { target: 'bun-darwin-arm64', name: 'spare-logo-editor-darwin-arm64' },
  { target: 'bun-darwin-x64', name: 'spare-logo-editor-darwin-x64' },
  { target: 'bun-linux-arm64', name: 'spare-logo-editor-linux-arm64' },
  { target: 'bun-linux-x64', name: 'spare-logo-editor-linux-x64' },
] as const;

mkdirSync('dist/release', { recursive: true });

for (const { target, name } of TARGETS) {
  const outfile = `dist/release/${name}`;
  console.log(`→ ${target}`);
  const result = await Bun.build({
    entrypoints: ['src/cli.tsx'],
    compile: { outfile, target },
    minify: true,
    sourcemap: 'linked',
    plugins: [stubDevtools],
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }
  console.log(`  ✔ ${outfile}`);
}
console.log('done');
