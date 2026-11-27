import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FixtureIndex } from './fixture-schema';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_FIXTURE_PATH = path.resolve(
  __dirname,
  '../../../fixtures/index/taxonomy.json',
);

let cached: FixtureIndex | null = null;

export function loadFixture(fixturePath = DEFAULT_FIXTURE_PATH): FixtureIndex {
  if (cached && fixturePath === DEFAULT_FIXTURE_PATH) return cached;
  const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const parsed = FixtureIndex.parse(raw);
  if (fixturePath === DEFAULT_FIXTURE_PATH) cached = parsed;
  return parsed;
}
