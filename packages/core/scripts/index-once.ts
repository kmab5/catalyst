import { createEngine } from '../src/engine.js'
const args=process.argv.slice(2)
const engine=createEngine()
try{
  const project=await engine.projects.open(args.find(a=>!a.startsWith('--'))??process.cwd())
  const run=project.index({ai:args.includes('--ai'),mode:args.includes('--full')?'full':'incremental'})
  let stage=''
  for await(const {event} of run.events()){
    if(stage!==event.stage){stage=event.stage;console.error(stage,event.message??'')}
  }
  const result=await run.done
  console.log(JSON.stringify({run:result,project:project.info()}))
  if(result.status!=='done')process.exitCode=1
}finally{await engine.close()}

