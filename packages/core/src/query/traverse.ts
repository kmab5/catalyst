import { ids, type EdgeKind, type GraphQuery, type GraphResponse, type ImpactDTO } from '@catalyst/shared'
import { posix } from 'node:path'
import { need, ref, type Catalog, type Edge } from './catalog.js'

export type Direction='up'|'down'|'both'
const structural=(e:Edge)=>e.kind!=='contains'&&e.kind!=='member_of'
export function adjacent(c:Catalog,id:string,dir:Direction,kinds?:EdgeKind[]){
  const steps:{id:string;direction:'up'|'down';edge:Edge}[]=[]
  if(dir!=='down')for(const edge of c.incoming.get(id)??[])steps.push({id:edge.src,direction:'up',edge})
  if(dir!=='up')for(const edge of c.outgoing.get(id)??[])steps.push({id:edge.dst,direction:'down',edge})
  return kinds?steps.filter(s=>kinds.includes(s.edge.kind)):steps
}
export function edgeRef(c:Catalog,id:string,e:Edge){return {kind:e.kind,provenance:e.provenance,confidence:e.confidence,filePath:e.filePath,line:e.line,node:ref(need(c,id))}}
export function impact(c:Catalog,root:string,direction:Direction,depth:number,kinds?:EdgeKind[]):ImpactDTO{
  need(c,root)
  const result:ImpactDTO={root,direction,depth,nodes:[],edges:[],byFeature:[],routes:[],truncated:false}
  const seen=new Set([root]), counts=new Map<string,number>()
  const pending=[{id:root,distance:0}]
  for(let i=0;i<pending.length;i++){
    const current=pending[i]!
    if(current.distance>=depth)continue
    for(const s of adjacent(c,current.id,direction,kinds)){
      if((!kinds&&!structural(s.edge))||seen.has(s.id))continue
      if(result.nodes.length>=500){result.truncated=true;continue}
      const distance=current.distance+1,node=need(c,s.id)
      seen.add(s.id);pending.push({id:s.id,distance})
      result.nodes.push({...ref(node),distance,direction:s.direction});result.edges.push(edgeRef(c,s.id,s.edge))
      if(node.kind==='route')result.routes.push(node.id)
      for(const id of new Set([node.id,...(node.filePath?[ids.file(node.filePath)]:[])].flatMap(id=>(c.outgoing.get(id)??[]).filter(e=>e.kind==='member_of').map(e=>e.dst))))counts.set(id,(counts.get(id)??0)+1)
    }
  }
  result.byFeature=Array.from(counts,([featureId,count])=>({featureId,count})).sort((a,b)=>b.count-a.count)
  return result
}
export function paths(c:Catalog,from:string,to:string,maxDepth=5,maxPaths=3){
  need(c,from);need(c,to)
  const result:string[][]=[],queue=[[from]]
  for(let i=0;i<queue.length&&result.length<maxPaths;i++){
    const path=queue[i]!,last=path[path.length-1]!
    if(last===to){result.push(path);continue}
    if(path.length>maxDepth)continue
    for(const e of c.outgoing.get(last)??[]){
      if(structural(e)&&!path.includes(e.dst)&&queue.length<10000)queue.push([...path,e.dst])
    }
  }
  return result
}
export function graphView(c:Catalog,opts:GraphQuery):GraphResponse {
  const level=opts.level??'file', limit=Math.min(opts.limit??400,2000)
  function project(id:string){
    const n=c.nodes.get(id);if(!n)return
    if(level==='feature')return n.kind==='feature'?id:undefined
    if(level==='symbol')return n.kind==='directory'?undefined:id
    if(level==='module'){
      if(n.kind==='directory')return id
      if(n.filePath){const dir=posix.dirname(n.filePath);return ids.dir(dir==='.'?'':dir)}
    }
    return n.kind==='file'?id:n.filePath?ids.file(n.filePath):undefined
  }
  const members=new Set((c.incoming.get(opts.feature??'')??[]).filter(e=>e.kind==='member_of').map(e=>e.src))
  const selected=new Set<string>()
  for(const n of c.nodes.values()){
    if(opts.feature&&!members.has(n.id)&&!(n.filePath&&members.has(ids.file(n.filePath))))continue
    const id=project(n.id),p=id&&c.nodes.get(id)
    if(p&&(!opts.nodeKinds?.length||opts.nodeKinds.includes(p.kind)))selected.add(p.id)
  }
  const edges=new Map<string,GraphResponse['edges'][number]>(),degrees=new Map<string,number>()
  for(const e of c.edges){
    if(!structural(e)||opts.edgeKinds?.length&&!opts.edgeKinds.includes(e.kind)||opts.provenance?.length&&!opts.provenance.includes(e.provenance))continue
    const source=project(e.src),target=project(e.dst)
    if(!source||!target||source===target||!selected.has(source)||!selected.has(target))continue
    const key=JSON.stringify([source,target,e.kind,e.provenance])
    const agg=edges.get(key);if(agg)agg.weight++;else edges.set(key,{source,target,kind:e.kind,weight:1,provenance:e.provenance})
    for(const id of [source,target])degrees.set(id,(degrees.get(id)??0)+1)
  }
  if(opts.focus){
    const focus=project(opts.focus),seen=new Set<string>(focus?[focus]:[])
    let frontier=new Set(seen)
    for(let d=0;d<(opts.depth??2)&&frontier.size;d++){
      const next=new Set<string>()
      for(const e of edges.values()){
        if(frontier.has(e.source)&&!seen.has(e.target))next.add(e.target)
        if(frontier.has(e.target)&&!seen.has(e.source))next.add(e.source)
      }
      for(const id of next)seen.add(id)
      frontier=next
    }
    for(const id of selected)if(!seen.has(id))selected.delete(id)
  }
  const visible=new Set([...selected].sort((a,b)=>(degrees.get(b)??0)-(degrees.get(a)??0)||a.localeCompare(b)).slice(0,limit))
  const flagCounts=new Map<string,number>()
  for(const f of c.flags){const id=project(f.node.id);if(id)flagCounts.set(id,(flagCounts.get(id)??0)+1)}
  return {level,totalNodes:selected.size,truncated:visible.size<selected.size,nodes:[...visible].map(id=>{
    const n=need(c,id),dir=n.filePath?posix.dirname(n.filePath):null
    return {id,label:n.name,kind:n.kind,parent:dir===null?null:ids.dir(dir==='.'?'':dir),featureId:c.outgoing.get(id)?.find(e=>e.kind==='member_of')?.dst??null,size:n.metrics.loc??1,flags:flagCounts.get(id)??0}
  }),edges:[...edges.values()].filter(e=>visible.has(e.source)&&visible.has(e.target))}
}

