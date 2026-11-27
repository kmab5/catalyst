import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';

export async function terminalPrompt(
  label: string,
  hidden: boolean,
  signal: AbortSignal,
  interrupt: () => void,
): Promise<string> {
  // In terminal mode readline owns echo, so a silent output hides the secret even on Windows.
  const silent = new Writable({
    write(_chunk, _encoding, done) {
      done();
    },
  });
  const input = createInterface({
    input: process.stdin,
    output: hidden ? silent : process.stderr,
    terminal: true,
    historySize: 0,
  });
  input.on('SIGINT', interrupt);
  try {
    if (hidden) process.stderr.write(label);
    return await input.question(hidden ? '' : label, { signal });
  } finally {
    input.close();
    if (hidden) process.stderr.write('\n');
  }
}
