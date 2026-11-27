import {posix} from 'node:path';
import {ids} from '@catalyst/shared';
import {Model} from '../graph/model.js';
import type {ParsedFile} from '../parse/types.js';
import type {Linked} from '../resolve/link.js';
import type {SourceFile} from '../scan/scanner.js';

export function routes(model:Model,files:SourceFile[],parsed:Record<string,ParsedFile>,link:Linked,dependencies:Set<string>,enabled:Record<string,boolean>={}){
  const mounts=new Map<string,{parent:string;prefix:string}[]>();
  const routerPrefixes=new Map<string,string>();
  const context=(path:string,expr:string)=>{
    const [root,attr]=expr.trim().split('.');
    const bound=link.bindings.get(path)?.get(root!);
    if(bound?.kind==='module')return ids.parse(bound.id).path+'#'+(attr??root);
    if(bound?.kind==='symbol'){const r=ids.parse(bound.id);return r.path+'#'+r.name;}
    return path+'#'+root;
  };
  for(const p of Object.values(parsed)){
    for(const c of p.calls){
      const [owner,method]=c.calleeText.split('.');
      if(method==='include_router'||method==='register_blueprint'||method==='use'&&c.literal&&c.args.length>1){
        const target=method==='use'?c.args.at(-1):c.args[0];if(!target)continue;
        const prefix=method==='use'?c.literal:c.args.join(',').match(/(?:url_)?prefix\s*=\s*['"]([^'"]+)['"]/)?.[1];
        const key=context(p.path,target), list=mounts.get(key)??[];
        list.push({parent:context(p.path,owner!),prefix:prefix??''});mounts.set(key,list);
      }
    }
  }
  for(const p of Object.values(parsed)){
    const vars=new Map(p.symbols.filter(s=>s.symbolKind==='variable').map(s=>[s.startLine,s.name]));
    for(const c of p.calls){
      const name=vars.get(c.line);
      if(!name||!['APIRouter','Blueprint'].includes(c.calleeText))continue;
      const prefix=c.args.join(',').match(/(?:url_)?prefix\s*=\s*['"]([^'"]+)['"]/)?.[1];
      if(prefix)routerPrefixes.set(context(p.path,name),prefix);
    }
  }
  function prefixes(key:string,seen=new Set<string>()):string[] {
    const local=routerPrefixes.get(key)??'';
    if(seen.has(key)||seen.size>4)return [local];
    const parents=mounts.get(key);
    return parents?.length?parents.flatMap(m=>prefixes(m.parent,new Set([...seen,key])).map(p=>p+m.prefix+local)):[local];
  }
  for(const file of files){
    const p=parsed[file.path];if(!p)continue;
    const emit=(method:string,path:string,handler:string|undefined,line:number,data:Record<string,unknown>={})=>{
      path=path.replace(/\/{2,}/g,'/');
      const id=ids.route(method,path);
      model.node(id,method.toUpperCase()+' '+path,{filePath:file.path,startLine:line,data:{method:method.toUpperCase(),path,...data}});
      if(handler&&model.nodes.has(handler))model.edge(id,handler,'handles',file.path,line);
    };
    const handlers=link.local.get(file.path)!;
    const app=file.path.match(/(?:^|\/)(?:src\/)?app\/(.*?)(page|layout|route)\.[jt]sx?$/);
    const pages=file.path.match(/(?:^|\/)(?:src\/)?pages\/(.+)\.[jt]sx?$/);
    const def=handlers.get('default')??handlers.get(p.exports.find(e=>e.exported==='default')?.local??'');
    if(enabled['next-app-router']!==false&&dependencies.has('next')&&app && (!app[1]||app[1].endsWith('/'))){
      const segments=app[1]!.split('/').filter(Boolean);
      if(!segments.some(s=>s.startsWith('_'))){
        const path='/'+segments.filter(s=>!/^\(.+\)$|^@/.test(s)).join('/');
        if(app[2]==='route'){
          for(const method of p.exportedNames.filter(n=>/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(n))){
            const local=p.exports.find(e=>e.exported===method)?.local??method;
            const handler=handlers.get(local)??link.bindings.get(file.path)?.get(local)?.id;
            emit(method,path,handler,model.nodes.get(handler??'')?.startLine??1);
          }
        }else emit(app[2]==='layout'?'LAYOUT':'PAGE',path,def,1,{type:app[2]});
      }
    } else if(enabled['next-pages-router']!==false&&dependencies.has('next')&&pages&&!/^_(?:app|document|error)$/.test(posix.basename(pages[1]!))){
      const path='/'+pages[1]!.split('/').filter((s,i,a)=>s!=='index'||i<a.length-1).join('/');
      emit(path.startsWith('/api/')?'ANY':'PAGE',path,def,1);
    } else if(enabled['next-middleware']!==false&&dependencies.has('next')&&/^(?:src\/)?middleware\.[jt]s$/.test(file.path))emit('MIDDLEWARE','*',handlers.get('middleware')??def,1);
    for(const dec of p.decorators){
      const m=dec.text.match(/^([\w.]+)\.(get|post|put|patch|delete|head|options|api_route|websocket|route)\(\s*['"]([^'"]*)['"]/);
      if(!m||!['fastapi','flask'].some(d=>dependencies.has(d)))continue;
      const methods=/route/.test(m[2]!)?[...(dec.text.match(/methods\s*=\s*\[([^\]]*)\]/)?.[1]??"'GET'").matchAll(/['"](\w+)['"]/g)].map(v=>v[1]!):[m[2]!];
      for(const prefix of prefixes(context(file.path,m[1]!)))for(const method of methods)emit(method,prefix+m[3],handlers.get(dec.target),dec.line);
    }
    if(enabled['node-http']!==false&&['express','hono','fastify','koa-router','@koa/router'].some(d=>dependencies.has(d))){
      for(const c of p.calls){
        const m=c.calleeText.match(/^(\w+)\.(get|post|put|patch|delete|all|options|head)$/);
        if(!m||!c.literal?.startsWith('/'))continue;
        const method=m[2]==='all'?'ANY':m[2]!;
        const handler=c.args.at(-1)??'';
        let target=handlers.get(handler)??link.bindings.get(file.path)?.get(handler)?.id;
        if(!target&&/=>|function\s*\(/.test(handler)){
          target=ids.sym(file.path,method.toUpperCase()+' '+c.literal,{line:c.line});
          model.node(target,method.toUpperCase()+' '+c.literal,{filePath:file.path,startLine:c.line,symbolKind:'function',tier:1});
          model.edge(ids.file(file.path),target,'contains',file.path,c.line);
        }
        for(const prefix of prefixes(context(file.path,m[1]!)))emit(method,prefix+c.literal,target,c.line);
      }
    }
  }
}
