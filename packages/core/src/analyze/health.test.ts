import {afterAll,beforeAll,expect,it} from 'vitest';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {analyze,type AnalysisResult} from '../analysis.js';
import {openStore} from '../store/index.js';
import {writeFeatureCouplings} from './rules/cross-feature-coupling.js';

let root:string,r:AnalysisResult;
beforeAll(async()=>{
  root=await mkdtemp(join(tmpdir(),'catalyst-health-'));
  await mkdir(join(root,'app','allow'),{recursive:true});
  await mkdir(join(root,'app','deny'),{recursive:true});
  await writeFile(join(root,'package.json'),'{"dependencies":{"next":"*","@prisma/client":"*"}}');
  await writeFile(join(root,'schema.prisma'),'model User {\n id Int @id\n}\n');
  await writeFile(join(root,'logic.ts'),[
    'export interface Service { run(): number }','export class Impl implements Service { run() { return 1 } }',
    'export interface Common {}','export class A implements Common {}','export class B implements Common {}',
    'export function target(x: number) { return x + 1 }',
    'export function forward(x: number) { return target(x) }','export function modified(x: number) { return target(x + 1) }',
    'export function requireUser() { return true }',
  ].join('\n'));
  await writeFile(join(root,'deep.ts'),"import {x} from '../../../../util'\n");
  await writeFile(join(root,'short.ts'),"import './logic'\n");
  await writeFile(join(root,'app','allow','route.ts'),"import { requireUser } from '../../logic'\nexport function POST() { requireUser(); return db.user.create({}) }");
  await writeFile(join(root,'app','deny','route.ts'),"export function DELETE() { return db.user.delete({}) }");
  r=await analyze(root);
});
afterAll(async()=>{await rm(root,{recursive:true,force:true});});
it('flags a single implementation and skips multiply implemented interfaces',()=>{
  const flagged=r.flags.filter(f=>f.rule==='single-impl-interface').map(f=>f.node.name);
  expect(flagged).toContain('Service');expect(flagged).not.toContain('Common');
});
it('only flags wrappers passing all arguments unchanged',()=>{
  const flagged=r.flags.filter(f=>f.rule==='pass-through-wrapper').map(f=>f.node.name);
  expect(flagged).toContain('forward');expect(flagged).not.toContain('modified');
});
it('checks relative import depth and recognizes authentication on write paths',()=>{
  expect(r.flags.filter(f=>f.rule==='deep-relative-import').map(f=>f.node.id)).toEqual(['file:deep.ts']);
  expect(r.flags.filter(f=>f.rule==='missing-auth-on-mutating-route').map(f=>f.node.id)).toEqual(['route:DELETE /deny']);
});
it('recomputes feature coupling after membership changes',()=>{
  const store=openStore(':memory:');
  try {
    store.saveAnalysis(r);
    const db=store.db;
    const feature=db.prepare("INSERT INTO nodes(id,kind,name,provenance,confidence) VALUES(?,'feature',?,'ast',1)");
    feature.run('feature:logic','Logic');feature.run('feature:routes','Routes');
    const member=db.prepare("INSERT INTO edges(src,dst,kind,confidence,provenance) VALUES(?,?,'member_of',1,'ast')");
    member.run('file:logic.ts','feature:logic');member.run('file:app/allow/route.ts','feature:routes');
    writeFeatureCouplings(db,{thresholds:{'cross-feature-coupling':{edges:1,ratio:.01}}});
    expect(db.prepare("SELECT COUNT(*) n FROM flags WHERE rule='cross-feature-coupling'").get()).toEqual({n:1});
    db.prepare("DELETE FROM edges WHERE kind='member_of' AND dst='feature:logic'").run();
    writeFeatureCouplings(db,{thresholds:{'cross-feature-coupling':{edges:1,ratio:.01}}});
    expect(db.prepare("SELECT COUNT(*) n FROM flags WHERE rule='cross-feature-coupling'").get()).toEqual({n:0});
  }finally{store.close();}
});
