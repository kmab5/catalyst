import { posix } from 'node:path';
import { ids } from '@catalyst/shared';
import { Model, sourceId } from '../graph/model.js';
import type { ParsedFile } from '../parse/types.js';
import type { Linked } from '../resolve/link.js';
import { readJson } from '../resolve/ts-resolver.js';
import type { SourceFile } from '../scan/scanner.js';
import { isEnvTemplate } from '../scan/secrets.js';
import { routes } from './routes.js';
import { hosts, serviceFor } from './services.js';

export function detect(
  model: Model,
  files: SourceFile[],
  parsed: Record<string, ParsedFile>,
  linked: Linked,
  enabled: Record<string, boolean> = {},
) {
  const dependencies = new Set<string>();
  const stack = new Map<string, { name: string; category: string; evidence: string[] }>();
  const addStack = (name: string, category: string, evidence: string) => {
    const s = stack.get(name) ?? { name, category, evidence: [] };
    if (s.evidence.length < 10 && !s.evidence.includes(evidence)) s.evidence.push(evidence);
    stack.set(name, s);
  };
  for (const f of files)
    if (posix.basename(f.path) === 'package.json') {
      const cfg = readJson(f.source) as { dependencies?: object; devDependencies?: object } | null;
      for (const dep of Object.keys({ ...cfg?.dependencies, ...cfg?.devDependencies })) dependencies.add(dep);
    }
  const models = new Map<string, string>();
  const filesByPath = new Map(files.map((f) => [f.path, f]));
  let database = 'database';
  for (const f of files.filter((f) => f.language === 'prisma' && enabled.prisma !== false)) {
    const provider = f.source.match(/datasource\s+\w+\s*\{[^}]*provider\s*=\s*"([^"]+)"/)?.[1];
    if (provider) database = provider === 'postgresql' ? 'postgres' : provider;
    for (const m of f.source.matchAll(/\bmodel\s+(\w+)\s*\{([^}]*)\}/g)) {
      const name = m[1]!,
        body = m[2]!,
        id = ids.db('prisma', name);
      const fields = [...body.matchAll(/^\s*(\w+)\s+([\w[\]?]+)([^\n]*)/gm)].map((v) => ({
        name: v[1],
        type: v[2],
        isRelation: v[3]!.includes('@relation'),
      }));
      model.node(id, name, {
        filePath: f.path,
        data: { orm: 'prisma', fields, table: body.match(/@@map\("([^"]+)"\)/)?.[1] ?? name },
      });
      models.set(name.toLowerCase(), id);
      addStack('Prisma', 'data', id);
    }
  }
  const sqlModels = new Map<string, string>();
  const sqlModelClasses = new Set<string>(),
    children = new Map<string, string[]>();
  for (const p of Object.values(parsed)) {
    const baseNames = new Set(
      p.imports
        .filter((i) => i.specifier === 'sqlmodel')
        .flatMap((i) => i.names.filter((n) => n.imported === 'SQLModel').map((n) => n.local)),
    );
    for (const ref of p.refs)
      if (ref.kind === 'extends' && baseNames.has(ref.name))
        sqlModelClasses.add(ids.sym(p.path, ref.callerSymbol));
  }
  for (const edge of model.edges.values())
    if (edge.kind === 'extends') {
      const list = children.get(edge.dst) ?? [];
      list.push(edge.src);
      children.set(edge.dst, list);
    }
  const queue = [...sqlModelClasses];
  for (let index = 0; index < queue.length; index++)
    for (const child of children.get(queue[index]!) ?? []) {
      if (!sqlModelClasses.has(child)) {
        sqlModelClasses.add(child);
        queue.push(child);
      }
    }
  for (const p of Object.values(parsed))
    for (const s of p.symbols.filter((s) => s.symbolKind === 'class')) {
      if (
        enabled.sqlalchemy !== false &&
        filesByPath.get(p.path)?.language === 'python' &&
        (/\b(?:Base|DeclarativeBase|db\.Model)\b/.test(s.signature) ||
          (sqlModelClasses.has(ids.sym(p.path, s.key)) && /\btable\s*=\s*True/.test(s.signature)))
      ) {
        const id = ids.db('sqlalchemy', s.name);
        sqlModels.set(s.name, id);
        const f = filesByPath.get(p.path)!;
        model.node(id, s.name, {
          filePath: p.path,
          startLine: s.startLine,
          data: {
            orm: 'sqlalchemy',
            table:
              f.source
                .split('\n')
                .slice(s.startLine - 1, s.endLine)
                .join('\n')
                .match(/__tablename__\s*=\s*['"](\w+)['"]/)?.[1] ??
              s.name.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase(),
          },
        });
      }
    }
  const pkgServices = new Map<string, string>();
  const labels: Record<string, string> = {
    next: 'Next.js',
    react: 'React',
    fastapi: 'FastAPI',
    flask: 'Flask',
    sqlmodel: 'SQLModel',
    sqlalchemy: 'SQLAlchemy',
    stripe: 'Stripe',
    'next-auth': 'NextAuth',
    '@prisma/client': 'Prisma',
  };
  for (const n of [...model.nodes.values()].filter((n) => n.kind === 'package')) {
    dependencies.add(n.name);
    const service = serviceFor(n.name, database);
    if (service && enabled.services !== false && enabled[service[0]] !== false) {
      const [name, category] = service,
        id = ids.svc(name);
      model.node(id, name, { provenance: 'resolved', data: { category } });
      model.edge(n.id, id, 'depends_on', null, null, 'resolved');
      pkgServices.set(n.id, id);
      addStack(labels[n.name] ?? name, category, n.id);
    }
    if (labels[n.name]) addStack(labels[n.name]!, 'framework', n.id);
  }
  for (const [name, label] of Object.entries(labels))
    if (dependencies.has(name) && !stack.has(label)) {
      const manifest = files.find(
        (f) => /package\.json$|pyproject\.toml$/.test(f.path) && f.source.includes(name),
      );
      if (manifest) addStack(label, 'framework', ids.file(manifest.path));
    }
  if (enabled.routes !== false)
    routes(
      model,
      files,
      parsed,
      linked,
      new Set([...dependencies].filter((d) => enabled[d] !== false)),
      enabled,
    );
  const env = (name: string, declaredIn?: string) => {
    const category = name.startsWith('NEXT_PUBLIC_')
      ? 'public'
      : /SECRET|KEY|TOKEN|PASSWORD/i.test(name)
        ? 'secret'
        : /URL|HOST/i.test(name)
          ? 'endpoint'
          : 'config';
    const id = ids.env(name);
    model.node(id, name, { data: { category, ...(declaredIn && { declaredIn }) } });
    return id;
  };
  if (enabled.env !== false)
    for (const f of files.filter((f) => isEnvTemplate(f.path)))
      for (const key of f.source.split('\n').filter(Boolean)) env(key, f.path);
  if (enabled.env !== false)
    for (const f of files) {
      if (/(?:^|\/)env\.[cm]?[jt]s$/.test(f.path) && f.source.includes('createEnv('))
        for (const m of f.source.matchAll(/^\s*([A-Z][A-Z0-9_]+)\s*:\s*z\./gm)) env(m[1]!, f.path);
      if (f.language === 'python') {
        const lines = f.source.split('\n');
        for (const s of parsed[f.path]?.symbols ?? [])
          if (s.symbolKind === 'class' && /\bBaseSettings\b/.test(s.signature)) {
            for (const m of lines
              .slice(s.startLine, s.endLine)
              .join('\n')
              .matchAll(/^\s+([A-Za-z]\w*):\s*[\w[]/gm)) {
              const key = m[1]!.toUpperCase();
              model.edge(
                ids.sym(f.path, s.key),
                env(key, f.path),
                'uses_env',
                f.path,
                s.startLine,
                'heuristic',
                0.7,
              );
            }
          }
      }
    }
  const servicesOf = (path: string, binding: string, depth = 0): Set<string> => {
    const found = new Set<string>();
    const target = linked.bindings.get(path)?.get(binding);
    if (!target || depth > 2) return found;
    const service = pkgServices.get(target.id);
    if (service) found.add(service);
    if (target.kind === 'symbol') {
      const n = model.nodes.get(target.id);
      if (n?.filePath && n.symbolKind === 'variable') {
        const origin = parsed[n.filePath];
        for (const c of origin?.calls ?? [])
          if (c.line >= n.startLine! && c.line <= n.endLine!)
            for (const id of servicesOf(n.filePath, c.calleeText.split('.')[0]!, depth + 1)) found.add(id);
      }
    }
    return found;
  };
  const envObjects = new Set<string>();
  if (enabled.env !== false)
    for (const file of Object.values(parsed)) {
      const factories = new Set(
        file.imports
          .filter((i) => i.specifier.startsWith('@t3-oss/env'))
          .flatMap((i) => i.names.filter((n) => n.imported === 'createEnv').map((n) => n.local)),
      );
      for (const call of file.calls)
        if (factories.has(call.calleeText)) {
          const object = file.symbols.find(
            (s) => s.symbolKind === 'variable' && s.startLine <= call.line && s.endLine >= call.line,
          );
          if (object) envObjects.add(ids.sym(file.path, object.key));
        }
    }
  for (const p of Object.values(parsed)) {
    const called = new Set<string>();
    if (enabled.env !== false)
      for (const e of p.env) {
        if (e.receiver) {
          const bound =
            linked.bindings.get(p.path)?.get(e.receiver)?.id ?? linked.local.get(p.path)?.get(e.receiver);
          if (
            !bound ||
            !envObjects.has(bound) ||
            p.symbols.find((s) => s.key === e.callerSymbol)?.localNames?.includes(e.receiver)
          )
            continue;
        }
        model.edge(
          sourceId(p.path, e.callerSymbol),
          env(e.name),
          'uses_env',
          p.path,
          e.line,
          e.receiver ? 'resolved' : 'ast',
        );
      }
    for (const c of p.calls) {
      const src = sourceId(p.path, c.callerSymbol),
        parts = c.calleeText.split('.');
      const [owner, member, op] = parts;
      const target = servicesOf(p.path, owner!);
      for (const id of target) {
        model.edge(src, id, 'calls_service', p.path, c.line, 'resolved');
        called.add(id);
      }
      if (
        enabled.supabase !== false &&
        enabled.services !== false &&
        ['auth', 'storage'].includes(member!) &&
        (target.has(ids.svc('supabase')) ||
          (/^supabase/i.test(owner!) && [...dependencies].some((d) => d.startsWith('@supabase/'))))
      ) {
        const extra = ids.svc('supabase-' + member);
        model.node(extra, 'supabase-' + member, { data: { category: member } });
        model.edge(
          src,
          extra,
          'calls_service',
          p.path,
          c.line,
          target.size ? 'resolved' : 'heuristic',
          target.size ? 1 : 0.7,
        );
      }
      const modelId = models.get(member?.toLowerCase() ?? '');
      if (modelId && op && (/^(db|prisma)$/i.test(owner!) || target.has(ids.svc(database)))) {
        const write = /^(create(?:Many)?|update(?:Many)?|upsert|delete(?:Many)?)$/.test(op);
        if (write || /^(find(?:First|Unique)(?:OrThrow)?|findMany|count|aggregate|groupBy)$/.test(op))
          model.edge(src, modelId, write ? 'writes' : 'reads', p.path, c.line, 'resolved');
      }
      const sup = c.calleeText.match(
        /(?:^|\.)(\w+)\.from\(\s*['"]([^'"]+)['"]\s*\)\.(insert|update|upsert|delete|select)$/,
      );
      if (
        enabled.supabase !== false &&
        sup &&
        (sup[1]!.toLowerCase().includes('supabase') ||
          [...(linked.bindings.get(p.path)?.values() ?? [])].some((v) => v.id.includes('supabase')))
      ) {
        const id = ids.db('supabase', sup[2]!);
        model.node(id, sup[2]!, { data: { orm: 'supabase' } });
        model.edge(src, id, sup[3] === 'select' ? 'reads' : 'writes', p.path, c.line, 'resolved');
      }
      if (
        /^(?:(?:session|db)\.(?:add|add_all|delete|merge|commit|exec|query|get)|select)$/.test(
          c.calleeText,
        ) &&
        sqlModels.size
      ) {
        const arg = c.args.join(',');
        const variable = p.pythonBindings
          .filter((b) => b.scope === c.callerSymbol && b.name === arg && b.line <= c.line)
          .at(-1);
        const name = arg.match(/\b([A-Z]\w*)\b/)?.[1] ?? variable?.typeName;
        const id = sqlModels.get(name ?? '') ?? ids.db('sqlalchemy', '*unknown');
        if (!model.nodes.has(id)) model.node(id, 'Unknown model', { data: { orm: 'sqlalchemy' } });
        model.edge(
          src,
          id,
          /\.(add|add_all|delete|merge|commit)$/.test(c.calleeText) ? 'writes' : 'reads',
          p.path,
          c.line,
          'heuristic',
          0.8,
        );
      }
      if (
        enabled.services !== false &&
        c.literal &&
        /^(fetch|axios(?:\.\w+)?|httpx\.\w+|requests\.\w+)$/.test(c.calleeText)
      ) {
        const host = c.literal.match(/^https?:\/\/([\w.-]+)/)?.[1];
        if (host) {
          const name = hosts[host] ?? 'http:' + host,
            id = ids.svc(name);
          model.node(id, name, { data: { host } });
          model.edge(src, id, 'calls_service', p.path, c.line, 'heuristic', 0.7);
        }
      }
    }
    for (const b of linked.bindings.get(p.path)?.values() ?? []) {
      const id = pkgServices.get(b.id);
      if (id && !called.has(id))
        model.edge(ids.file(p.path), id, 'calls_service', p.path, null, 'heuristic', 0.7);
    }
  }
  return [...stack.values()];
}
