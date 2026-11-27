import { extname, basename } from 'node:path';

const languages: Record<string,string> = {
  ts:'typescript',mts:'typescript',cts:'typescript',tsx:'tsx',js:'javascript',mjs:'javascript',cjs:'javascript',jsx:'jsx',
  py:'python',pyi:'python',prisma:'prisma',go:'go',rs:'rust',java:'java',rb:'ruby',cs:'csharp',php:'php',kt:'kotlin',swift:'swift',
  c:'c',h:'c',cpp:'cpp',hpp:'cpp',md:'markdown',mdx:'markdown',css:'css',scss:'scss',yaml:'yaml',yml:'yaml',json:'json',
  sql:'sql',toml:'toml',graphql:'graphql',vue:'vue',svelte:'svelte',
};
export function languageOf(path: string) {
  const language = languages[extname(path).slice(1).toLowerCase()] ?? (basename(path)==='Dockerfile'?'dockerfile':'unknown');
  const tier: 0|1|2 = ['typescript','tsx','javascript','jsx','python','prisma'].includes(language) ? 1 :
    ['go','rust','java','ruby','csharp','php','kotlin','swift','c','cpp'].includes(language) ? 2 : 0;
  return {language,tier};
}
