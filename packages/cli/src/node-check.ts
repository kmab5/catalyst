export function checkNode(
  version = process.versions.node,
): { ok: true } | { ok: false; message: string } {
  const normalized = version.replace(/^v/, '');
  if (Number(normalized.split('.')[0]) >= 22) return { ok: true };
  return {
    ok: false,
    message:
      '✗ Catalyst needs Node.js 22 or newer (found v' +
      normalized +
      ').\n  Install it from https://nodejs.org or with your version manager (nvm install 22).',
  };
}
