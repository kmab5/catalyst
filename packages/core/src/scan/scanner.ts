import {createHash} from 'node:crypto';
import {readdir,readFile,lstat} from 'node:fs/promises';
import {join, posix} from 'node:path';
import ignore, {type Ignore} from 'ignore';
import {languageOf} from './languages.js';
import {isSecretFile} from './secrets.js';

export interface SourceFile {
  path:string; language:string; tier:number; hash:string; sizeBytes:number; loc:number;
  parsedHash:string|null; parseError:string|null; source:string;
}
export interface ScanOptions {
  extraIgnore?:string[]; include?:string[]; maxFileBytes?:number; signal?:AbortSignal;tier3?:boolean;
}
const builtins = ['node_modules/','.git/','.catalyst/','dist/','build/','out/','.next/','.nuxt/','.svelte-kit/','.turbo/','.vercel/','coverage/','.cache/','venv/','.venv/','__pycache__/','.mypy_cache/','.pytest_cache/','.tox/','target/','vendor/','*.map','next-env.d.ts','package-lock.json','pnpm-lock.yaml','yarn.lock','bun.lockb','poetry.lock','Pipfile.lock','uv.lock','Cargo.lock','go.sum'];

export async function scan(root:string, options:ScanOptions={}, progress?:(n:number,total:number)=>void) {
  const files:SourceFile[] = [];
  async function readRules(dir:string, name:string) {
    const path=join(root,dir,name);
    try { if ((await lstat(path)).isFile()) return ignore().add(await readFile(path,'utf8')); } catch { /* optional */ }
    return ignore();
  }
  const override = (await readRules('','.catalystignore')).add(options.extraIgnore??[]).add((options.include??[]).map(x=>'!'+x));
  async function walk(dir:string, ancestors:{dir:string;rules:Ignore}[]) {
    const rules=[...ancestors,{dir,rules:await readRules(dir,'.gitignore')}];
    const entries=(await readdir(join(root,dir),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name));
    for (const entry of entries) {
      options.signal?.throwIfAborted();
      const path=posix.join(dir,entry.name);
      if(entry.isSymbolicLink() || isSecretFile(path)) continue;
      const checked=path+(entry.isDirectory()?'/':'');
      let excluded=false;
      for(const scope of [...rules,{dir:'',rules:override}]) {
        const result=scope.rules.test(checked.slice(scope.dir?scope.dir.length+1:0));
        if(result.ignored || result.unignored) excluded=result.ignored;
      }
      if(excluded) continue;
      if(entry.isDirectory()) {
        if(entry.name==='env' && await lstat(join(root,path,'pyvenv.cfg')).then(()=>true,()=>false)) continue;
        await walk(path,rules); continue;
      }
      if(!entry.isFile()) continue;
      const file:SourceFile={path,...languageOf(path),hash:'',source:'',sizeBytes:0,loc:0,parsedHash:null,parseError:null};
      try {
        const stat=await lstat(join(root,path));
        file.sizeBytes=stat.size;
        if(stat.size>(options.maxFileBytes??1048576)) {
          file.hash=createHash('sha1').update(stat.size+'@'+stat.mtimeMs).digest('hex');
          file.parseError='too_large';
        } else {
          const bytes=await readFile(join(root,path));
          file.hash=createHash('sha1').update(bytes).digest('hex');
          if(bytes.subarray(0,8192).includes(0)) file.parseError='binary';
          else {
            const source=bytes.toString('utf8');
            const lines=source.split(/\r?\n/);
            file.loc=lines.filter(s=>s.trim()).length;
            if(/\.min\.(?:css|js)$/.test(path)||source.length/lines.length>300||lines.some(s=>s.length>5000)) file.parseError='minified';
            else if(/^\.env\.(example|sample)$/.test(entry.name)) file.source=lines.flatMap(s=>s.match(/^\s*(?:export\s+)?([\w]+)\s*=/)?.[1]??[]).join('\n');
            else file.source=source;
          }
        }
      } catch (error) { file.parseError=String(error); }
      if(file.tier===2 && file.language!=='go' || ['sql','yaml','toml','json','graphql','vue','svelte','dockerfile'].includes(file.language))file.tier=options.tier3?3:0;
      if(file.parseError) file.tier=0;
      files.push(file);
      if(files.length%25===0) progress?.(files.length,files.length);
    }
  }
  await walk('',[{dir:'',rules:ignore().add(builtins)}]);
  progress?.(files.length,files.length);
  return files;
}
