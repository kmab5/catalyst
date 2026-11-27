import type Parser from 'web-tree-sitter';
export interface RawSymbol {
 name:string; key:string; symbolKind:string; startLine:number;endLine:number;exported:boolean;signature:string;
 parentName?:string;isDefault:boolean; loc:number; passThrough?:string;
}
export interface RawImport {specifier:string;names:{imported:string;local:string}[];isNamespace:boolean;isDefault:boolean;isTypeOnly:boolean;isDynamic:boolean;line:number}
export interface RawExport {local:string;exported:string;specifier?:string}
export interface RawCall {callerSymbol:string;calleeText:string;line:number;args:string[];argsCount:number;literal?:string;guarded:boolean}
export interface RawRef {callerSymbol:string;name:string;line:number;kind:'references'|'extends'|'implements'}
export interface RawJsx {callerSymbol:string;name:string;line:number}
export interface RawDecorator {target:string;text:string;line:number}
export interface RawStringCall {callee:string;literal:string;line:number}
export interface ParsedFile {
 path:string;symbols:RawSymbol[];imports:RawImport[];exports:RawExport[];calls:RawCall[];jsx:RawJsx[];
 refs:RawRef[];decorators:RawDecorator[];strings:RawStringCall[];complexity:Record<string,number>;
 directives:string[];exportedNames:string[];partial:boolean;env:{callerSymbol:string;name:string;line:number}[];
}
export interface FileInput {path:string;source:string;parser:Parser}
export function emptyParsedFile(path:string):ParsedFile {
 return {path,symbols:[],imports:[],exports:[],calls:[],jsx:[],refs:[],decorators:[],strings:[],complexity:{},directives:[],exportedNames:[],partial:false,env:[]};
}
export interface LanguageAdapter {languages:string[];parse:(input:FileInput)=>ParsedFile}
