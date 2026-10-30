import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
// Optional change groups can be selected separately; run only their delivered regression files.
const manifest = JSON.parse(
  fs.readFileSync(new URL('./optimization-tests.json', import.meta.url), 'utf8'),
);
const tests = manifest.filter((file) => fs.existsSync(path.resolve(file)));
if (!tests.length) {
  console.log('No additional optimization tests in this selection. Existing suite still applies.');
} else {
  const result = spawnSync(
    process.execPath,
    [
      '--experimental-strip-types',
      '--import',
      './scripts/register-typescript-imports.mjs',
      '--test',
      ...tests,
    ],
    { stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
