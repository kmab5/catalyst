import {posix as p} from 'node:path';
import {isBuiltin} from 'node:module';
import type {RawExport} from '../parse/types.js';
export type TsResolution={kind:'file';path:string}|{kind:'package';name:string;builtin:boolean}|{kind:'unresolved'};
interface Config {extends?:string;compilerOptions?:{baseUrl?:string;paths?:Record<string,string[]>};name?:string;exports?:unknown;main?:string;module?:string;types?:string}
export function readJson(text:string) {
  try {return JSON.parse(text.replace(/("(?:\\.|[^"\\])*")|\/\/[^\r\n]*|\/\*[\s\S]*?\*\//g,(match,str)=>str??'').replace(/,(\s*[}\]])/g,'$1')) as Config;} catch{return null;}
}
function entry(value:unknown):string|null {
  if(typeof value==='string') return value;
  if(value && typeof value==='object') for(const k of ['import','default','require','types',...Object.keys(value)]) {
    const v=(value as Record<string,unknown>)[k]; if(v!==undefined){const resolved=entry(v);if(resolved)return resolved;}
  }
  return null;
}
export class TsResolver {
  private packages=new Map<string,{dir:string;config:Config}>();
  private configs=new Map<string,{base:string;paths:Record<string,string[]>}>();
  constructor(private files:Set<string>,private read:(path:string)=>unknown) {
    for(const path of files) if(p.basename(path)==='package.json') {
      const config=read(path) as Config|null;
      if(config?.name) this.packages.set(config.name,{dir:p.dirname(path),config});
    }
  }
  private config(path:string,seen=new Set<string>()):{base:string;paths:Record<string,string[]>} {
    const cached=this.configs.get(path);if(cached) return cached;
    const dir=p.dirname(path);
    if(seen.has(path)) return {base:dir,paths:{}};
    seen.add(path);
    const cfg=this.read(path) as Config|null;
    let base=dir, paths:Record<string,string[]>={};
    if(cfg?.extends?.startsWith('.')){
      const extended=p.join(dir,cfg.extends.replace(/(?:\.json)?$/,'.json'));
      const parent=this.config(extended,seen);base=parent.base;paths={...parent.paths};
    }
    const opts=cfg?.compilerOptions;
    if(opts?.baseUrl) base=p.join(dir,opts.baseUrl);
    if(opts?.paths) for(const [pattern,values] of Object.entries(opts.paths)) paths[pattern]=values.map(v=>p.join(opts.baseUrl?base:dir,v));
    const result={base,paths};this.configs.set(path,result);return result;
  }
  private probe(path:string):string|undefined {
    const without=path.replace(/\.(?:[cm]?js|jsx)$/,'');
    const exts=['.ts','.tsx','.mts','.cts','.js','.jsx','.mjs','.cjs','.d.ts','.json'];
    return [path,...exts.map(ext=>without+ext),...exts.map(ext=>p.join(path,'index'+ext))].find(f=>this.files.has(f));
  }
  resolve(fromFile:string,specifier:string):TsResolution {
    let path:string|undefined;
    if(specifier.startsWith('.')) path=this.probe(p.join(p.dirname(fromFile),specifier));
    else {
      let dir=p.dirname(fromFile);
      for(;;){
        const config=['tsconfig.json','jsconfig.json'].map(x=>p.join(dir,x)).find(x=>this.files.has(x));
        if(config){
          const {base,paths}=this.config(config);
          for(const pattern of Object.keys(paths).sort((a,b)=>b.length-a.length)){
            const [prefix,suffix='']=pattern.split('*');
            if(pattern===specifier||pattern.includes('*')&&specifier.startsWith(prefix!)&&specifier.endsWith(suffix)){
              const part=specifier.slice(prefix!.length,suffix? -suffix.length:undefined);
              for(const cand of paths[pattern]!) {path=this.probe(cand.replace('*',part));if(path)break;}
            }
            if(path) break;
          }
          path??=this.probe(p.join(base,specifier));break;
        }
        const parent=p.dirname(dir);if(parent===dir)break;dir=parent;
      }
      if(!path){
        const name=specifier.split('/').slice(0,specifier.startsWith('@')?2:1).join('/');
        const pkg=this.packages.get(name);
        if(pkg) {
          const sub=specifier.slice(name.length);
          const exports=pkg.config.exports;
          const target=exports && typeof exports==='object'?entry((exports as Record<string,unknown>)['.'+sub]):null;
          const targetPath=target??(sub?sub.slice(1):entry(exports)??pkg.config.module??pkg.config.main??pkg.config.types??'index');
          path=this.probe(p.join(pkg.dir,targetPath));
        }
        if(!path) return {kind:'package',name,builtin:isBuiltin(specifier)};
      }
    }
    return path?{kind:'file',path}:{kind:'unresolved'};
  }
  resolveBinding(from:string,specifier:string,name:string,exports:Map<string,RawExport[]>,seen=new Set<string>()):{file:string;name:string}|null {
    const result=this.resolve(from,specifier);
    if(result.kind!=='file' || seen.has(result.path)||seen.size>5)return null;
    seen=new Set([...seen,result.path]);
    const list=exports.get(result.path)??[];
    const match=list.find(e=>e.exported===name);
    if(match?.specifier)return this.resolveBinding(result.path,match.specifier,match.local,exports,seen);
    if(match)return {file:result.path,name:match.local};
    for(const star of list.filter(e=>e.exported==='*'&&e.specifier)) {
      const target=this.resolveBinding(result.path,star.specifier!,name,exports,seen);if(target)return target;
    }
    return null;
  }
}
