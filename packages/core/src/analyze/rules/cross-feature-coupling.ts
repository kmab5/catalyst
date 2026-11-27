import {ids} from '@catalyst/shared';
import type Database from 'better-sqlite3';
import {DEFAULT_THRESHOLDS,type HealthOptions} from '../health.js';

export function writeFeatureCouplings(db:Database.Database,options:HealthOptions={}){
  const edges=db.prepare("SELECT e.src,e.dst,a.file_path sourceFile,b.file_path targetFile,e.kind FROM edges e JOIN nodes a ON a.id=e.src JOIN nodes b ON b.id=e.dst WHERE e.kind NOT IN ('contains','depends_on','feature_depends')").all() as {src:string;dst:string;sourceFile:string|null;targetFile:string|null;kind:string}[];
  const names=new Map((db.prepare("SELECT id,name FROM nodes WHERE kind='feature'").all() as {id:string;name:string}[]).map(n=>[n.id,n.name]));
  const memberships=new Map<string,Set<string>>(),totals=new Map<string,number>(),pairs=new Map<string,Map<string,number>>();
  for(const e of edges)if(e.kind==='member_of'&&e.dst!==ids.feature('shared')){
    const ids=memberships.get(e.src)??new Set<string>();ids.add(e.dst);memberships.set(e.src,ids);
  }
  const features=(id:string,path:string|null)=>memberships.get(id)??(path?memberships.get(ids.file(path)):undefined)??[];
  for(const e of edges)if(e.kind!=='member_of'){
    for(const from of features(e.src,e.sourceFile)){
      totals.set(from,(totals.get(from)??0)+1);
      for(const to of features(e.dst,e.targetFile)){
        if(from===to)continue;
        const row=pairs.get(from)??new Map<string,number>();row.set(to,(row.get(to)??0)+1);pairs.set(from,row);
      }
    }
  }
  const rule='cross-feature-coupling',limits={...DEFAULT_THRESHOLDS[rule],...options.thresholds?.[rule]};
  db.transaction(()=>{
    db.prepare("DELETE FROM metrics WHERE metric LIKE 'coupling:%'").run();
    db.prepare('DELETE FROM flags WHERE rule=?').run(rule);
    const metric=db.prepare('INSERT INTO metrics(node_id,metric,value) VALUES (?,?,?)');
    const flag=db.prepare('INSERT INTO flags(id,rule,severity,node_id,title,explanation,evidence) VALUES (?,?,?,?,?,NULL,?)');
    for(const [from,row] of pairs){
      const strongest=[...row].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0]!;
      for(const [to,count] of row)metric.run(from,'coupling:'+to,count);
      const [to,count]=strongest,ratio=count/totals.get(from)!;
      if(options.disabled?.includes(rule)||count<limits.edges||ratio<limits.ratio)continue;
      const title=names.get(from)+' and '+names.get(to)+' share '+count+' dependency links. A change to one can affect the other.';
      flag.run(rule+':'+from,rule,'warn',from,title,JSON.stringify({metrics:{count,ratio},nodeIds:[from,to]}));
    }
  })();
}
