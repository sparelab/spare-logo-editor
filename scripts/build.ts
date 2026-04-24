import { stubDevtools } from './stub-devtools.ts';

const result = await Bun.build({
  entrypoints: ['src/cli.tsx'],
  outdir: 'dist',
  target: 'node',
  format: 'esm',
  plugins: [stubDevtools],
  sourcemap: 'linked',
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
console.log(`built ${result.outputs.length} file(s)`);
for (const out of result.outputs) console.log(`  ${out.path}`);
