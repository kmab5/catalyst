import { randomUUID } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { AskRequest, IndexRequest, Lang, type ProjectDTO, type RunDTO } from '@catalyst/shared'
import type { Engine, EngineOptions, IndexRun, Project } from './engine.js'
import { CatalystError } from './errors.js'
import { analyze, type AnalysisResult } from './analysis.js'
import { createQueryApi } from './query/query.js'
import { openStore, type Store } from './store/index.js'
import { LocalPathSource, ProjectRegistry, directory, ensureGitignore, expandHome, isProjectDir, projectId, readJson } from './project/local.js'
import { SettingsStore } from './settings/settings.js'
import { startIndexRun } from './jobs/index-run.js'
import { writeFeatureCouplings } from './analyze/rules/cross-feature-coupling.js'
import { createProvider, LLMClient, runAiStages, ask, estimate, diffNarrative, writeDeterministicFeatures } from './ai/index.js'

function rebuildSearch(s:Store,result:AnalysisResult,lang:Lang){
  const files=new Map(result.files.map(f=>[f.path,f.source.split(/\r?\n/)]))
  const summaries=new Map(s.all<{id:string;json:string}>('SELECT node_id id,json FROM summaries WHERE language=?',lang).map(r=>[r.id,JSON.parse(r.json)]))
  s.db.transaction(()=>{
    s.db.exec('DELETE FROM search_fts')
    for(const n of s.all<{id:string;name:string;kind:string;path:string|null;start:number|null;end:number|null}>('SELECT id,name,kind,file_path path,start_line start,end_line end FROM nodes')){
      const lines=n.path?files.get(n.path):null, summary=summaries.get(n.id)
      const code=lines?.slice((n.start??1)-1,n.end??lines.length).join('\n').slice(0,n.kind==='file'?16000:2048)??''
      s.stmt('INSERT INTO search_fts VALUES (?,?,?,?,?,?,?)').run(n.id,n.kind,n.name,n.path??'',summary?.purpose??'',summary?.tags?.join(' ')??'',code)
    }
  })()
}
type Config={outputLanguage?:Lang;include?:string[];ignore?:string[];maxFileBytes?:number;health?:NonNullable<Parameters<typeof analyze>[1]>['health'];detectors?:Record<string,boolean>}
function projectStats(s:Store,lang:Lang):NonNullable<ProjectDTO['stats']>{
  const count=(sql:string,...p:unknown[])=>s.one<{n:number}>('SELECT count(*) n FROM '+sql,...p)!.n
  return {files:count('files'),analysedFiles:count('files WHERE parsed_hash IS NOT NULL'),symbols:count("nodes WHERE kind='symbol'"),edges:count('edges'),features:count('features WHERE language=?',lang),flags:count('flags'),languages:s.all('SELECT language,tier,count(*) files FROM files GROUP BY language,tier ORDER BY files DESC')}
}
function staleAtOpen(store:Store,root:string,when:number){
  const paths=store.all<{path:string}>('SELECT path FROM files')
  const dirs=new Set<string>([root])
  for(const {path} of paths){const full=join(root,path);dirs.add(dirname(full));try{if(statSync(full).mtimeMs>when+1)return true}catch{return true}}
  return [...dirs].some(dir=>{try{return statSync(dir).mtimeMs>when+1}catch{return true}})
}
export function createEngine(opts:EngineOptions={}):Engine{
  const home=opts.homeDir??homedir(),settings=new SettingsStore(home,opts.env??process.env),registry=new ProjectRegistry(home)
  const opened=new Map<string,{project:Project;store:Store}>()
  let closed=false
  function connect(root:string,lastOpenedAt:number):Project{
    if(closed)throw new CatalystError('BAD_REQUEST','Engine is closed')
    const id=projectId(root),existing=opened.get(id)
    if(existing)return existing.project
    const indexPath=join(root,'.catalyst')
    if(existsSync(indexPath)&&!lstatSync(indexPath).isDirectory())throw new CatalystError('BAD_REQUEST','Invalid index directory')
    mkdirSync(indexPath,{recursive:true})
    for(const suffix of ['','-wal','-shm','-journal']){
      const file=join(indexPath,'catalyst.db'+suffix)
      if(existsSync(file)&&!lstatSync(file).isFile())throw new CatalystError('BAD_REQUEST','Invalid index file')
    }
    const store=openStore(join(indexPath,'catalyst.db')),source=new LocalPathSource(root)
    store.meta.set('project_root',root)
    const cfg=()=>readJson<Config>(join(root,'catalyst.config.json'),{})
    const language=()=>Lang.parse(store.meta.get('output_language')??cfg().outputLanguage??settings.get().outputLanguage)
    const previous=Number(store.meta.get('last_index_at')??0)
    let stale=previous>0&&staleAtOpen(store,root,previous),active:IndexRun|null=null
    const runs=new Map<string,IndexRun>()
    function info():ProjectDTO{
      const when=Number(store.meta.get('last_index_at'))||null,lang=language()
      return {id,name:basename(root),root,lastOpenedAt:registry.recent().find(r=>r.id===id)?.lastOpenedAt??lastOpenedAt,
        status:active?'indexing':store.meta.get('last_status')==='error'?'error':!when?'never-indexed':stale?'stale':'ready',
        aiStatus:(store.meta.get('ai_status')??'none') as ProjectDTO['aiStatus'],outputLanguage:lang,lastIndexedAt:when,activeRunId:active?.id??null,lastRunId:store.meta.get('last_run_id'),stats:when?projectStats(store,lang):null}
    }
    const query=createQueryApi(store,source,info)
    function provider(){const {config}=settings.resolved();return config.provider?createProvider(config.provider,config.models,root):null}
    function client(signal?:AbortSignal,budgetUsd?:number){
      const p=provider();if(!p)throw new CatalystError('AI_NOT_CONFIGURED','Choose a provider in Settings to use AI.')
      const {config}=settings.resolved()
      return new LLMClient(p,store.db,{concurrency:config.concurrency,budgetUsd:budgetUsd??config.budgetUsd,signal})
    }
    const project:Project={id,root,name:basename(root),info,query,
      activeRun:()=>active,getRun:id=>store.run(id),runById:id=>runs.get(id),
      index(request={}){
        if(active)throw new CatalystError('INDEX_RUNNING','This project is already indexing',{runId:active.id})
        const req=IndexRequest.parse(request),config=cfg(),lang=req.language??config.outputLanguage??settings.get().outputLanguage
        const run=startIndexRun(store,async(signal,report,stats)=>{
          const saved=req.mode==='full'?null:store.meta.get('parse_cache')
          const result=await analyze(root,{signal,previous:saved?JSON.parse(saved):undefined,grammarsDir:opts.grammarsDir,extraIgnore:config.ignore,include:config.include,maxFileBytes:config.maxFileBytes,health:config.health,detectors:config.detectors,onProgress:report})
          signal.throwIfAborted();store.saveAnalysis(result)
          if(req.ai&&provider()){
            const ai=await runAiStages({db:store.db,root,client:client(signal,req.budgetUsd),lang,signal,onProgress:(stage,n,total,degraded)=>report(stage,n,total,undefined,degraded)})
            stats.llmCalls=ai.usage.calls;stats.cacheHits=ai.usage.cacheHits;stats.tokens={in:ai.usage.tokensIn,out:ai.usage.tokensOut};stats.costUsdEstimate=ai.usage.costUsd
            store.meta.set('ai_status',ai.aiStatus)
          }else{
            writeDeterministicFeatures(store.db,lang);store.meta.set('ai_status','skipped')
          }
          signal.throwIfAborted();writeFeatureCouplings(store.db,config.health)
          report('fts',0,result.nodes.length);rebuildSearch(store,result,lang);report('fts',result.nodes.length,result.nodes.length)
          store.meta.set('output_language',lang)
        },finished=>{
          active=null;store.meta.set('last_status',finished.status)
          if(finished.status==='done'){const at=finished.finishedAt!;store.meta.set('last_index_at',String(at));store.meta.set('last_run_id',finished.id);registry.indexed(id,at);stale=false}
        })
        active=run;runs.set(run.id,run);if(runs.size>12)runs.delete(runs.keys().next().value!)
        return run
      },
      ask(request,signal){
        const req=AskRequest.parse(request),llm=client(signal)
        return (async function*(){
          for await(const event of ask(llm,query,{...req,lang:req.lang??language()},signal)){
            if(event.type==='done')store.stmt('INSERT INTO asks VALUES (?,?,?,?)').run(randomUUID(),req.question,JSON.stringify(event.answer),Date.now())
            yield event
          }
        })()
      },
      asks:()=>store.all('SELECT id,question,created_at createdAt FROM asks ORDER BY created_at DESC LIMIT 50'),
      estimate:(lang=language())=>estimate(store.db,lang,provider()??undefined),
      diffNarrative:async(diff,lang=language())=>provider()?diffNarrative(client(),diff,lang):null
    }
    opened.set(id,{store,project});return project
  }
  function get(id:string){
    const open=opened.get(id);if(open)return open.project
    const rec=registry.recent().find(r=>r.id===id)
    return rec&&existsSync(rec.root)?connect(directory(rec.root),rec.lastOpenedAt):undefined
  }
  return {settings,isProjectDir,projects:{
    list(){return registry.recent().flatMap(r=>{const p=get(r.id);return p?[p.info()]:[]})},
    async open(path){const root=directory(expandHome(path,home));ensureGitignore(root);const p=connect(root,Date.now());registry.touch(root);return p},get,
    async forget(id,options){const p=get(id);if(!p)throw new CatalystError('PROJECT_NOT_FOUND','Unknown project')
      const active=p.activeRun();if(active){active.cancel();await active.done}
      opened.get(id)?.store.close();opened.delete(id);registry.forget(id)
      if(options?.purge)await rm(join(p.root,'.catalyst'),{recursive:true,force:true})
    }
  },browse(path=home){
    const root=directory(expandHome(path,home));return {path:root,parent:dirname(root)===root?null:dirname(root),entries:readdirSync(root,{withFileTypes:true}).filter(e=>e.isDirectory()&&!e.name.startsWith('.')).map(e=>{const path=join(root,e.name);return {name:e.name,path,isProject:isProjectDir(path),hasIndex:existsSync(join(path,'.catalyst','catalyst.db'))}}).sort((a,b)=>a.name.localeCompare(b.name))}
  },async close(){closed=true;for(const {project,store} of opened.values()){const run=project.activeRun();if(run){run.cancel();await run.done}store.close()}opened.clear()}}
}

