import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function auditPackage(root = process.cwd()) {
  const mini = path.join(root, 'miniprogram');
  const config = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'));
  const app = JSON.parse(fs.readFileSync(path.join(mini, 'app.json'), 'utf8'));
  const ignores = config.packOptions?.ignore ?? [];
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || entry.name === 'miniprogram_npm') continue;
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) files.push(path.relative(mini, absolute).replaceAll('\\', '/'));
    }
  }
  walk(mini);
  const ignored = (name) =>
    ignores.some((rule) =>
      rule.type === 'file'
        ? rule.value === name
        : rule.type === 'folder' && name.startsWith(rule.value.replace(/\/$/u, '') + '/'),
    );
  const issues = [];
  for (const file of files) {
    if (/\.(?:test\.mjs|md)$/u.test(file) && !ignored(file))
      issues.push({ kind: 'development-file', file });
    if (!file.endsWith('.json') || !fs.existsSync(path.join(mini, file.replace(/json$/u, 'wxml'))))
      continue;
    const json = JSON.parse(fs.readFileSync(path.join(mini, file), 'utf8'));
    const wxml = fs.readFileSync(path.join(mini, file.replace(/json$/u, 'wxml')), 'utf8');
    for (const component of Object.keys(json.usingComponents ?? {})) {
      if (!new RegExp('<' + component + '(?:\\s|/|>)', 'u').test(wxml))
        issues.push({ kind: 'unused-component', file, component });
    }
  }
  const buckets = Object.fromEntries(
    ['main', ...(app.subPackages ?? []).map((item) => item.root)].map((name) => [
      name,
      { sourceBytes: 0, files: 0 },
    ]),
  );
  for (const file of files.filter((name) => !ignored(name))) {
    const bucket =
      (app.subPackages ?? []).find((item) => file.startsWith(item.root + '/'))?.root ?? 'main';
    buckets[bucket].sourceBytes += fs.statSync(path.join(mini, file)).size;
    buckets[bucket].files++;
  }
  return {
    method:
      'Local source bytes after explicit pack exclusions; excludes npm build, TypeScript compilation and platform compression. Not a WeChat upload package measurement.',
    issues,
    buckets,
    explicitExcludedFiles: files.filter(ignored).length,
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = auditPackage(process.argv[2] ?? process.cwd());
  console.log(JSON.stringify(result, null, 2));
  if (result.issues.length) process.exitCode = 1;
}
