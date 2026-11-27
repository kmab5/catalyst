import { basename } from 'node:path';
export function isSecretFile(path: string) {
  const name = basename(path).toLowerCase();
  return (
    !['.env.example', '.env.sample'].includes(name) &&
    /^(?:\.env(?:\..*)?|id_rsa.*|credentials.*\.json|secrets\..*)$|\.(?:pem|key|p12)$/.test(name)
  );
}
