import { stubDevtools } from './stub-devtools.ts';

// Allow CI to override target + outfile via env so we can build per-platform
// binaries from a single matrix job.
const target = (process.env.TARGET ?? '') as
  | ''
  | 'bun-darwin-arm64'
  | 'bun-darwin-x64'
  | 'bun-linux-x64'
  | 'bun-linux-arm64'
  | 'bun-windows-x64';
const outfile = process.env.OUTFILE ?? 'dist/spare-logo-editor';

const result = await Bun.build({
  entrypoints: ['src/cli.tsx'],
  compile: target ? { outfile, target } : { outfile },
  minify: true,
  sourcemap: 'linked',
  plugins: [stubDevtools],
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
console.log(
  `compiled standalone binary -> ${outfile}${target ? ` (${target})` : ''}`,
);
