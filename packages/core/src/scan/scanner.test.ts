import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { scan } from './scanner.js';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'catalyst-scan-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

it('keeps only variable names from mixed-case environment templates', async () => {
  await writeFile(join(root, '.ENV.Example'), 'API_TOKEN=synthetic-value\n');
  expect(await scan(root)).toEqual([expect.objectContaining({ source: 'API_TOKEN' })]);
});

it('excludes repository and index metadata even when explicitly included', async () => {
  for (const dir of ['.git', '.catalyst']) {
    await mkdir(join(root, dir));
    await writeFile(join(root, dir, 'metadata.txt'), 'synthetic metadata');
  }
  await writeFile(join(root, 'index.ts'), 'export const n = 1');
  const files = await scan(root, { include: ['.git/**', '.catalyst/**', 'index.ts'] });
  expect(files.map((file) => file.path)).toEqual(['index.ts']);
});
