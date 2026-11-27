import {randomUUID} from 'node:crypto'
import type {ProgressEvent, RunDTO} from '@catalyst/shared'
import type {IndexRun} from '../engine.js'
import type {Store} from '../store/index.js'
import {CatalystError} from '../errors.js'

export type Report=(stage:ProgressEvent['stage'],done:number,total:number,message?:string,degraded?:boolean)=>void
type Stats=NonNullable<RunDTO['stats']>
export function startIndexRun(store:Store,work:(signal:AbortSignal,report:Report,stats:Stats)=>Promise<void>,finished:(run:RunDTO)=>void):IndexRun{
  const id=randomUUID(),controller=new AbortController(),listeners=new Set<()=>void>()
  const history:{id:number;event:ProgressEvent}[]=[]
  let seq=0,terminal=false,stageStarted=Date.now()
  const stats:Stats={stageMs:{},tokens:{in:0,out:0},llmCalls:0,cacheHits:0,costUsdEstimate:null}
  const run:RunDTO={id,status:'running',startedAt:Date.now(),finishedAt:null,lastEvent:null,stats,error:null}
  store.db.transaction(()=>{
    const owner=store.meta.get('run_owner')
    if(owner){
      const lease=JSON.parse(owner) as {pid:number;id:string}
      let alive=true
      try{process.kill(lease.pid,0)}catch(e){alive=(e as NodeJS.ErrnoException).code!=='ESRCH'}
      if(alive)throw new CatalystError('INDEX_RUNNING','Another process is indexing this project',{runId:lease.id})
      const previous=store.run(lease.id)
      if(previous?.status==='running'){
        store.saveRun({...previous,status:'error',finishedAt:Date.now(),error:'Indexing process stopped before completion'})
      }
    }
    store.meta.set('run_owner',JSON.stringify({pid:process.pid,id}))
    store.saveRun(run)
  }).immediate()
  const report:Report=(stage,done,total,message,degraded)=>{
    const previous=run.lastEvent?.stage
    if(previous!==stage){if(previous)stats.stageMs[previous]=(stats.stageMs[previous]??0)+Date.now()-stageStarted;stageStarted=Date.now()}
    const event:ProgressEvent={runId:id,stage,done,total,message,degraded}
    history.push({id:++seq,event});if(history.length>500)history.shift()
    run.lastEvent=event
    if(previous!==stage||done===total)store.saveRun(run)
    for(const wake of listeners)wake()
    listeners.clear()
  }
  const done=Promise.resolve().then(async()=>{
    try{await work(controller.signal,report,stats);controller.signal.throwIfAborted();run.status='done'}
    catch(err){run.status=controller.signal.aborted?'cancelled':'error';run.error=err instanceof Error?err.message:'Indexing failed'}
    run.finishedAt=Date.now();terminal=true
    try{report(run.status,1,1,run.error??undefined);finished(run)}
    finally{store.stmt("DELETE FROM meta WHERE key='run_owner' AND value=?").run(JSON.stringify({pid:process.pid,id}))}
    return run
  })
  return {id,done,cancel:()=>controller.abort(),events(since=0){
    // A pending next() can be abandoned when an SSE client disconnects.
    let cursor=since,closed=false,notify:(()=>void)|undefined
    return { [Symbol.asyncIterator](){ return {
      async next(){
        while(!closed){
          const item=history.find(e=>e.id>cursor)
          if(item){cursor=item.id;return {done:false as const,value:item}}
          if(terminal)break
          await new Promise<void>(resolve=>{notify=resolve;listeners.add(resolve)})
        }
        return {done:true as const,value:undefined}
      },
      async return(){closed=true;if(notify){listeners.delete(notify);notify()}return {done:true as const,value:undefined}}
    }}}
  }}
}

