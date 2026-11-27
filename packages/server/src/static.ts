import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { getMimeType } from 'hono/utils/mime';
import type { Context } from 'hono';

function inside(root: string, target: string) {
  const rel = relative(root, target);
  return rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel);
}
async function regularFile(root: string, path: string) {
  try {
    const actual = await realpath(path);
    if (inside(root, actual) && (await stat(actual)).isFile()) return actual;
  } catch (err) {
    if (!['ENOENT', 'ENOTDIR'].includes((err as NodeJS.ErrnoException).code ?? '')) throw err;
  }
}
export async function serveUi(c: Context, dir: string | undefined, token: string) {
  if (!dir) return c.text('UI not built');
  const root = await realpath(dir);
  const path = decodeURIComponent(c.req.path);
  if (path.includes('\\') || path.includes('\0')) return c.notFound();
  const requested = resolve(root, '.' + path);
  if (!inside(root, requested)) return c.notFound();
  const file = await regularFile(root, requested) ?? await regularFile(root, join(root, 'index.html'));
  if (!file) return c.text('UI not built', 404);
  if (extname(file) === '.html') {
    const escaped = token.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const meta = '<meta name="catalyst-token" content="' + escaped + '">';
    const html = await readFile(file, 'utf8');
    c.header('Cache-Control', 'no-store');
    return c.html(/<\/head>/i.test(html) ? html.replace(/<\/head>/i, () => meta + '</head>') : meta + html);
  }
  return c.body(new Uint8Array(await readFile(file)), 200, { 'Content-Type': getMimeType(file) ?? 'application/octet-stream' });
}
