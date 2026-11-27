import { basename } from 'node:path';
export function isEnvTemplate(path: string) {
  return /^\.env\.(?:example|sample)$/i.test(basename(path));
}
export function isSecretFile(path: string) {
  const name = basename(path).toLowerCase();
  return (
    !isEnvTemplate(name) &&
    /^(?:\.env(?:\..*)?|id_rsa.*|credentials.*\.json|secrets\..*)$|\.(?:pem|key|p12)$/.test(name)
  );
}
