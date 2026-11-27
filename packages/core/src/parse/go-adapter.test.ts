import {it,expect} from 'vitest';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {analyze} from '../analysis.js';
it('loads Go tags, resolves module imports and labels name-matched calls',async()=>{
 const root=await mkdtemp(join(tmpdir(),'go-tags-'));
 try{
   await mkdir(join(root,'thing'));
   await writeFile(join(root,'go.mod'),'module example.com/app\n');
   await writeFile(join(root,'thing','thing.go'),'package thing\ntype Thing struct{}\nfunc (t Thing) Do() {}\nfunc Build() Thing { return Thing{} }\n');
   await writeFile(join(root,'main.go'),'package main\nimport (\n "example.com/app/thing"\n "fmt"\n)\nfunc main(){fmt.Println(thing.Build())}\n');
   await writeFile(join(root,'extra.rs'),'fn helper() {}');
   await writeFile(join(root,'schema.sql'),'CREATE TABLE example (id int)');
   const r=await analyze(root,{tier3:true});
   expect(r.files.find(f=>f.path==='main.go')?.tier).toBe(2);
   expect(r.files.find(f=>f.path==='main.go')?.parseError).toBeNull();
   expect(r.files.find(f=>f.path==='extra.rs')?.tier).toBe(3);
   expect(r.files.find(f=>f.path==='schema.sql')?.tier).toBe(3);
   expect(r.nodes.map(n=>n.id)).toContain('sym:thing/thing.go#Thing.Do');
   expect(r.edges).toEqual(expect.arrayContaining([
     expect.objectContaining({src:'file:main.go',dst:'file:thing/thing.go',kind:'imports',provenance:'resolved'}),
     expect.objectContaining({src:'file:main.go',dst:'pkg:go:fmt',kind:'imports'}),
     expect.objectContaining({src:'sym:main.go#main',dst:'sym:thing/thing.go#Build',kind:'calls',provenance:'heuristic',confidence:.6})
   ]));
   const disabled=await analyze(root);
   expect(disabled.files.find(f=>f.path==='extra.rs')?.tier).toBe(0);
   expect(disabled.files.find(f=>f.path==='schema.sql')?.tier).toBe(0);
 }finally{await rm(root,{recursive:true,force:true});}
});
