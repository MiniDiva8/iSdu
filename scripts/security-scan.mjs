import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const root = process.cwd();
const maxTrackedFileBytes = 5 * 1024 * 1024;
const textExtensions = new Set([
  '.cjs',
  '.css',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.ts',
  '.wxml',
  '.wxss',
  '.yaml',
  '.yml',
]);
const secretPatterns = [
  { label: 'private key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u },
  { label: 'Tencent SecretId', pattern: /AKID[A-Za-z0-9]{12,}/u },
  { label: 'real-looking WeChat AppID', pattern: /\bwx[0-9a-f]{16}\b/u },
  {
    label: 'hard-coded CloudBase environment ID',
    pattern: /\benv\s*:\s*['"](?:cloud|prod|test|dev)[A-Za-z0-9_-]{4,}['"]/u,
  },
  {
    label: 'assigned platform secret',
    pattern: /\b(?:AppSecret|SecretId|SecretKey)\s*[:=]\s*['"][^'"\s]{8,}['"]/iu,
  },
];

function sourceCopyFiles() {
  if (!existsSync(join(root, 'package.json')) || !existsSync(join(root, 'miniprogram'))) {
    throw new Error('Security scan must run at the iSdu project root.');
  }
  const ignoredDirectories = new Set([
    '.git',
    '.codex',
    '.agents',
    '.aws',
    'node_modules',
    'miniprogram_npm',
    'dist',
    'coverage',
    '.secrets',
    'third-party-evaluation',
    '.idea',
    '.vscode',
  ]);
  const ignoredNames =
    /^(?:.*\.private\.config\.json|project\.private\.config\.json|\.cloudbaserc(?:\..*)?|\.DS_Store|Thumbs\.db|.*\.log)$/u;
  const files = [];
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) visit(absolutePath);
        continue;
      }
      if (!entry.isFile() || ignoredNames.test(entry.name)) continue;
      if (/^\.env(?:\..*)?$/u.test(entry.name) && entry.name !== '.env.example') continue;
      if (
        directory === root &&
        (/^ChatGPT Image/u.test(entry.name) || /\.(psd|psb|ai)$/iu.test(entry.name))
      )
        continue;
      files.push(relative(root, absolutePath));
    }
  }
  visit(root);
  return files;
}

function repositoryFiles() {
  // ZIP delivery copies have no Git metadata; still scan their scoped source files.
  if (!existsSync(join(root, '.git'))) return sourceCopyFiles();
  const output = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: root, encoding: 'utf8' },
  );
  return output.split('\0').filter(Boolean);
}

function scanCloudFunctionDependencies(issues) {
  const packageFiles = repositoryFiles().filter((file) =>
    /^cloudfunctions\/[A-Za-z0-9_-]+\/package\.json$/u.test(file.replaceAll('\\', '/')),
  );
  const exactVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;

  for (const packageFile of packageFiles) {
    const manifest = JSON.parse(readFileSync(join(root, packageFile), 'utf8'));
    for (const [name, version] of Object.entries(manifest.dependencies ?? {})) {
      if (typeof version !== 'string' || !exactVersion.test(version)) {
        issues.push(`${packageFile}: dependency ${name} must use an exact version, got ${version}`);
      }
    }
  }
}

const issues = [];
const files = repositoryFiles();

for (const file of files) {
  const absolutePath = join(root, file);
  const size = statSync(absolutePath).size;
  if (size > maxTrackedFileBytes) {
    issues.push(`${file}: ${size} bytes exceeds the 5 MiB repository limit`);
  }
  if (!textExtensions.has(extname(file).toLowerCase())) continue;

  const contents = readFileSync(absolutePath, 'utf8');
  for (const { label, pattern } of secretPatterns) {
    if (pattern.test(contents)) issues.push(`${file}: possible ${label}`);
  }
}

scanCloudFunctionDependencies(issues);

if (issues.length > 0) {
  console.error('Security scan failed:');
  for (const issue of issues) console.error(`- ${issue}`);
  process.exitCode = 1;
} else {
  console.log(`Security scan passed for ${files.length} repository files.`);
}
