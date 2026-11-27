import { resolve } from 'node:path';
import { createEngine } from '@catalyst/core';
import { startServer } from '../src/index.js';

const engine = createEngine();
const project = await engine.projects.open(resolve(process.argv[2] ?? '.'));
const run = project.index({ ai: false });
const result = await run.done;
if (result.status !== 'done') {
  await engine.close();
  throw new Error(result.error ?? 'Indexing did not complete');
}
const server = await startServer(engine);
console.error('Serving ' + project.id + ' at ' + server.url);
async function stop() {
  await server.close();
  await engine.close();
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
