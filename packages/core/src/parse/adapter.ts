import type Parser from 'web-tree-sitter';
import type {FileInput,ParsedFile,RawImport,RawSymbol} from './types.js';

type Node=Parser.SyntaxNode;
const field=(n:Node,k:string)=>n.childForFieldName(k);
const unquote=(s:string)=>s.slice(1,-1);
const line=(n:Node)=>n.startPosition.row+1;
const branch=new Set(['if_statement','elif_clause','if_clause','for_statement','for_in_statement','while_statement','do_statement','switch_case','catch_clause','ternary_expression','except_clause','conditional_expression','boolean_operator','case_clause']);
const kinds:Record<string,string>={function_declaration:'function',generator_function_declaration:'function',function_definition:'function',class_declaration:'class',abstract_class_declaration:'class',class_definition:'class',method_definition:'method',interface_declaration:'interface',type_alias_declaration:'type',enum_declaration:'enum',type_spec:'type',method_declaration:'method'};
function literal(n:Node|undefined|null) {
  if(!n||!['string','template_string','interpreted_string_literal'].includes(n.type)) return undefined;
  return unquote(n.text);
}
function parseImports(n:Node,py:boolean) {
  const result:RawImport[]=[];
  const base={names:[] as RawImport['names'],isDefault:false,isNamespace:false,isTypeOnly:false,isDynamic:false,line:line(n)};
  if(py) {
    const from=field(n,'module_name');
    for(const part of n.namedChildren.filter(c=>c.id!==from?.id && c.type!=='comment')){
      const original=field(part,'name')?.text??part.text;
      const local=field(part,'alias')?.text??original.split('.')[0]!;
      result.push({...base,specifier:from?.text??original,isNamespace:!from,names:[{imported:from?original:'*',local}]});
    }
  } else {
    const src=literal(field(n,'source')); if(src===undefined) return result;
    const clause=n.namedChildren.find(c=>c.type==='import_clause');
    const typeOnly=/^import\s+type\b/.test(n.text);
    if(!clause) return [{...base,specifier:src,isTypeOnly:typeOnly}];
    for(const item of clause.namedChildren) {
      if(item.type==='named_imports'){
        for(const binding of item.namedChildren.filter(c=>c.type==='import_specifier')){
          const name=field(binding,'name')?.text; if(!name) continue;
          result.push({...base,specifier:src,isTypeOnly:typeOnly||/^type\s/.test(binding.text),names:[{imported:name,local:field(binding,'alias')?.text??name}]});
        }
      } else if(item.type==='namespace_import'||item.type==='identifier') {
        const ns=item.type==='namespace_import';
        result.push({...base,specifier:src,isNamespace:ns,isDefault:!ns,isTypeOnly:typeOnly,names:[{imported:ns?'*':'default',local:ns?item.lastNamedChild!.text:item.text}]});
      }
    }
  }
  return result;
}

export function parseFile({parser,source,path}:FileInput,py=false):ParsedFile {
  const tree=parser.parse(source);
  const p:ParsedFile={path,symbols:[],imports:[],exports:[],calls:[],jsx:[],refs:[],decorators:[],strings:[],complexity:{},directives:[],exportedNames:[],partial:false,env:[]};
  const seen=new Set<string>();
  const lines=source.split(/\r?\n/);
  const visit=(n:Node,caller:string,className:string|undefined,guarded:boolean) => {
    const type=n.type;
    let name=field(n,'name')?.text;
    let kind=kinds[type];
    const value=field(n,'value')??field(n,'right');
    let callable=n;
    if(type==='function_definition' && className && caller===className) kind='method';
    if(type==='variable_declarator' && caller==='<module>' && name && /^[\w$]+$/.test(name)) {
      kind=value && /arrow_function|function_expression/.test(value.type)?'function':'variable';
      callable=value??n;
    }
    if(type==='assignment' && py && caller==='<module>' && field(n,'left')?.type==='identifier') {name=field(n,'left')!.text;kind='variable';}
    const exported=n.parent?.type==='export_statement'?n.parent:n.parent?.parent?.type==='export_statement'?n.parent.parent:null;
    if(!kind && exported && ['arrow_function','function_expression','class'].includes(type) && n.parent?.type==='export_statement'){
      kind=type==='class'?'class':'function';name=field(n,'name')?.text??'default';
    }
    if(kind && name) {
      const body=field(callable,'body');
      const defaultExport=Boolean(exported && /^export\s+default\b/.test(exported.text));
      const parentName=kind==='method'?className:undefined;
      const base=parentName?parentName+'.'+name:defaultExport?'default':name;
      const key=seen.has(base)?base+'@'+line(n):base;
      seen.add(key);
      if(kind==='function' && !py) {
        if(/^use[A-Z]/.test(name)) kind='hook';
        else if(/^[A-Z]/.test(name)&&body?.descendantsOfType(['jsx_element','jsx_self_closing_element','jsx_fragment']).length) kind='component';
      }
      const endLine=n.endPosition.row+1;
      const text=n.text;
      const symbol:RawSymbol={name,key,symbolKind:kind,startLine:line(n),endLine,isDefault:defaultExport,
        exported:py?caller==='<module>'&&!name.startsWith('_'):Boolean(exported),parentName,
        signature:(body?source.slice(n.startIndex,body.startIndex):text).replace(/\s+/g,' ').trim().slice(0,160),
        loc:lines.slice(line(n)-1,endLine).filter(l=>l.trim()&&!/^\s*(?:\/\/|#)/.test(l)).length};
      const params=field(callable,'parameters')?.text.replace(/[()\s]/g,'');
      const pass=body?.text.match(/^(?:\{\s*return\s+|return\s+)?([\w$.]+)\s*\(([\w$,\s]*)\)\s*;?\s*\}?$/);
      if(pass && params===pass[2]!.replace(/\s/g,'')) symbol.passThrough=pass[1];
      p.symbols.push(symbol);
      if(symbol.exported) p.exports.push({local:name,exported:defaultExport?'default':name});
      if(n.parent?.type==='decorated_definition') for(const dec of n.parent.namedChildren.filter(c=>c.type==='decorator')) p.decorators.push({target:key,text:dec.text.slice(1),line:line(dec)});
      if(kind==='class') {
        className=key;
        const supers=field(n,'superclasses');
        for(const sup of supers?.namedChildren??[]) if(sup.type!=='keyword_argument') p.refs.push({callerSymbol:key,name:sup.text,line:line(sup),kind:'extends'});
      }
      if(kind!=='variable') caller=key;
      if(['method','function','component','hook'].includes(kind)) p.complexity[key]=1;
    }
    if(p.complexity[caller]!==undefined && (branch.has(type)||(type==='binary_expression' && n.children.some(c=>['&&','||','??'].includes(c.type))))) p.complexity[caller]!++;
    if(type==='import_statement'||type==='import_from_statement') p.imports.push(...parseImports(n,py));
    if(type==='export_statement') {
      const specifier=literal(field(n,'source'));
      const clause=n.namedChildren.find(c=>c.type==='export_clause');
      if(clause) for(const s of clause.namedChildren) {
        const local=field(s,'name')?.text; if(local) p.exports.push({local,exported:field(s,'alias')?.text??local,specifier});
      }
      else if(specifier) p.exports.push({local:'*',exported:'*',specifier});
      else if(field(n,'value')?.type==='identifier') p.exports.push({local:field(n,'value')!.text,exported:'default'});
    }
    if(type==='assignment_expression' && /^(?:module\.exports|exports\.[\w$]+)$/.test(field(n,'left')?.text??'')) {
      const left=field(n,'left')!.text;
      p.exports.push({local:field(n,'right')?.text??'',exported:left==='module.exports'?'default':left.slice(8)});
    }
    if(['call','new_expression','call_expression'].includes(type)){
      const callee=field(n,'function')??field(n,'constructor');
      const args=(field(n,'arguments')?.namedChildren??[]).filter(c=>c.type!=='comment');
      if(callee){
        const calleeText=callee.text.replace(/\s*\?\.\s*|\s*\.\s*/g,'.');
        const lit=literal(args[0]);
        p.calls.push({callerSymbol:caller,calleeText,line:line(n),args:args.map(a=>a.text.slice(0,1500)),argsCount:args.length,literal:lit,guarded:guarded||/\.catch\s*\(/.test(n.parent?.parent?.text.slice(-200)??'')});
        if(lit!==undefined){
          p.strings.push({callee:calleeText,literal:lit,line:line(n)});
          if(calleeText==='import'||calleeText==='require'){
            const local=n.parent?.type==='variable_declarator'?field(n.parent,'name')?.text:undefined;
            p.imports.push({specifier:lit,names:local?[{imported:'*',local}]:[],isDefault:false,isNamespace:!!local,isDynamic:calleeText==='import',isTypeOnly:false,line:line(n)});
          }
          if(['os.getenv','os.environ.get'].includes(calleeText)) p.env.push({callerSymbol:caller,name:lit,line:line(n)});
        }
      }
    }
    if(type==='jsx_opening_element'||type==='jsx_self_closing_element'){
      const tag=field(n,'name')?.text;
      if(tag && /^[A-Z]/.test(tag)) p.jsx.push({callerSymbol:caller,name:tag,line:line(n)});
    }
    if(['member_expression','subscript_expression','subscript'].includes(type)){
      const match=n.text.match(/^(?:process\.env|import\.meta\.env|os\.environ)(?:\.([\w$]+)|\[['"](\w+)['"]\])$/);
      if(match) p.env.push({callerSymbol:caller,name:(match[1]??match[2])!,line:line(n)});
    }
    if(type==='variable_declarator' && value?.text==='process.env'){
      for(const key of field(n,'name')?.namedChildren??[]) p.env.push({callerSymbol:caller,name:key.text.split(':')[0]!.trim(),line:line(key)});
    }
    if(type==='extends_clause'||type==='implements_clause'){
      for(const ref of n.namedChildren) p.refs.push({callerSymbol:caller,name:ref.text.split('<')[0]!,kind:type==='extends_clause'?'extends':'implements',line:line(ref)});
    } else if((type==='identifier'||type==='type_identifier') && ['arguments','argument_list','return_statement','array','list','type_annotation'].includes(n.parent?.type??'')) {
      p.refs.push({callerSymbol:caller,name:n.text,kind:'references',line:line(n)});
    }
    if(type==='expression_statement'&&n.parent?.id===tree.rootNode.id){
      const directive=literal(n.firstNamedChild); if(directive==='use client'||directive==='use server') p.directives.push(directive);
    }
    for(const child of n.namedChildren) visit(child,caller,className,guarded||type==='try_statement');
  };
  try {
    const top=tree.rootNode.namedChildren;
    p.partial=top.filter(n=>n.hasError).length>top.length*.2;
    visit(tree.rootNode,'<module>',undefined,false);
    const all=py?source.match(/^__all__\s*=\s*\[([^\]]*)\]/m):null;
    for(const sym of p.symbols) {
      if(all) sym.exported=[...all[1]!.matchAll(/['"]([^'"]+)['"]/g)].some(m=>m[1]===sym.name);
      else if(p.exports.some(e=>e.local===sym.name&&!e.specifier)) sym.exported=true;
    }
    p.exportedNames=[...new Set(p.exports.map(e=>e.exported))];
    return p;
  } finally { tree.delete(); }
}
