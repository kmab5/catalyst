import { checkNode } from './node-check.js';

const check = checkNode();
if (!check.ok) {
  process.stderr.write(check.message + '\n');
  process.exitCode = 6;
} else {
  const { main } = await import('./main.js');
  process.exitCode = await main(process.argv.slice(2));
}
