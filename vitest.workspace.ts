import { readdirSync, existsSync } from 'node:fs';
import { defineWorkspace } from 'vitest/config';
export default defineWorkspace(
  readdirSync(new URL('./packages/', import.meta.url), { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        existsSync(new URL('./packages/' + entry.name + '/package.json', import.meta.url)),
    )
    .map((entry) => 'packages/' + entry.name),
);
