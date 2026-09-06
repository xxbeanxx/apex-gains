import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root: string = process.cwd();

type BoundaryRule = [directory: string, forbiddenPatterns: RegExp[]];

const rules: BoundaryRule[] = [
  [
    './src/application',
    [
      /^(?:@nestjs|react-router|@react-router|drizzle-|postgres|openid-client|express|vite|node:)/, //
      /^~(?:app|server|infrastructure)\//,
    ],
  ],
  [
    './src/domain',
    [
      /^~(?!domain\/)/, //
      /^(?:@nestjs|react-router|@react-router|drizzle-|postgres|openid-client|express|vite|node:)/,
    ],
  ],
  [
    './src/infrastructure',
    [
      /^~(?:app|server)\//, //
    ],
  ],
];

async function files(directory: string): Promise<string[]> {
  const entries = await readdir(join(root, directory), { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => (entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)])),
  );
  return nested.flat().filter((file) => /\.[cm]?[jt]sx?$/.test(file));
}

const failures: string[] = [];

for (const [directory, forbidden] of rules) {
  for (const file of await files(directory)) {
    if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) continue;

    const source: string = await readFile(join(root, file), 'utf8');

    for (const match of source.matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/g)) {
      const importedModule = match[1];
      if (forbidden.some((pattern) => pattern.test(importedModule))) {
        failures.push(`${relative(root, file)} imports ${importedModule}`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error(`Architecture boundary violations:\n${failures.join('\n')}`);
  process.exitCode = 1;
}
