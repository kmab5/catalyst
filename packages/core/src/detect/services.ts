export function serviceFor(name: string, database: string): [string, string] | undefined {
  const groups: [RegExp, string, string][] = [
    [/^(stripe|@stripe\/)/, 'stripe', 'payments'],
    [/^@lemonsqueezy\//, 'lemonsqueezy', 'payments'],
    [/^@paddle\//, 'paddle', 'payments'],
    [/^(next-auth|@auth\/|@next-auth\/)/, 'nextauth', 'auth'],
    [/^@clerk\//, 'clerk', 'auth'],
    [/^@supabase\//, 'supabase', 'data'],
    [/^firebase/, 'firebase', 'data'],
    [/^(?:jose|pyjwt|python-jose|jsonwebtoken|pwdlib|passlib|authlib)$/, 'jwt', 'auth'],
    [/^passport/, 'passport', 'auth'],
    [/^(nodemailer|emails)$/, 'smtp', 'email'],
    [/^(?:@sendgrid\/mail|sendgrid)$/, 'sendgrid', 'email'],
    [/^@?react-email/, 'react-email', 'email'],
    [/^(?:anthropic|@anthropic-ai\/sdk)$/, 'anthropic', 'ai'],
    [/^(?:ai|@ai-sdk\/.*|langchain)$/, 'ai-sdk', 'ai'],
    [/^@upstash\//, 'upstash', 'infra'],
    [/^(?:ioredis|redis)$/, 'redis', 'infra'],
    [/^@?sentry[-/]/, 'sentry', 'analytics'],
    [/^posthog/, 'posthog', 'analytics'],
    [/^(?:@prisma\/client|prisma|drizzle-orm|sqlalchemy|sqlmodel|mongoose)$/, database, 'data'],
  ];
  for (const [pattern, id, category] of groups) if (pattern.test(name)) return [id, category];
  if (name.startsWith('@aws-sdk/client-')) return ['aws-' + name.slice(16), 'infra'];
  if (['aws-sdk', 'boto3'].includes(name)) return ['aws', 'infra'];
  if (name.startsWith('@vercel/'))
    return ['vercel-' + name.slice('@vercel/'.length), name.endsWith('analytics') ? 'analytics' : 'infra'];
  const simple: Record<string, string> = {
    lucia: 'auth',
    'better-auth': 'auth',
    resend: 'email',
    postmark: 'email',
    openai: 'ai',
    uploadthing: 'storage',
    cloudinary: 'storage',
  };
  if (simple[name]) return [name, simple[name]!];
}
export const hosts: Record<string, string> = {
  'api.stripe.com': 'stripe',
  'api.github.com': 'github',
  'api.openai.com': 'openai',
  'api.anthropic.com': 'anthropic',
  'hooks.slack.com': 'slack',
};
