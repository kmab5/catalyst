const secretPatterns = [
  /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-]*PRIVATE KEY-----|$)/g,
  /\b(?:sk[-_](?:live_|test_)?[A-Za-z\d_-]{8,}|(?:AKIA|ASIA)[A-Z\d]{16}|gh[pousr]_[A-Za-z\d_]{10,}|github_pat_[\w]+|xox[a-z]-[A-Za-z\d-]{8,})/g,
  /\beyJ[A-Za-z\d_-]+\.[A-Za-z\d_-]+\.[A-Za-z\d_-]+/g,
];
export function redactSecrets(input: string): string {
  let text = input;
  for (const pattern of secretPatterns) text = text.replace(pattern, '«redacted»');
  return text.replace(
    /([\w.-]*(?:key|secret|token|password)[\w.-]*["']?\s*[:=]\s*["'])([^"'\s]{32,})(["'])/gi,
    '$1«redacted»$3',
  );
}
export function privatePath(path: string): boolean {
  return /(?:^|[\\/])(?:\.env(?:\..*)?|[^\\/]*\.(?:key|pem|p12)|id_rsa[^\\/]*|credentials[^\\/]*\.json|secrets\.[^\\/]*)$/i.test(
    path,
  );
}
