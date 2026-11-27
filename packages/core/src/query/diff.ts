import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ids, type DiffImpactDTO, type NodeRef } from '@catalyst/shared';
import type { QueryApi } from './types.js';
import { CatalystError } from '../errors.js';
const exec = promisify(execFile);
export async function diffImpact(
  root: string,
  query: QueryApi,
  base?: string,
): Promise<Omit<DiffImpactDTO, 'narrative'>> {
  async function git(args: string[]) {
    try {
      return (
        await exec('git', ['-c', 'core.quotepath=false', ...args], {
          cwd: root,
          windowsHide: true,
          maxBuffer: 16 * 1024 * 1024,
        })
      ).stdout;
    } catch {
      throw new CatalystError('BAD_REQUEST', 'Could not resolve the Git comparison');
    }
  }
  const revision = (
    await git(['rev-parse', '--verify', '--end-of-options', (base ?? 'HEAD') + '^{commit}'])
  ).trim();
  const target = base ? (await git(['merge-base', revision, 'HEAD'])).trim() : revision;
  const names = (
    await git(['diff', '--no-ext-diff', '--name-status', '-z', '-M', target, '--'])
  ).split('\0');
  const changedFiles: DiffImpactDTO['changedFiles'] = [];
  const previousPaths = new Map<string,string>();
  for (let i = 0; i < names.length && names[i]; ) {
    const type = names[i++]!,
      old = names[i++]!,
      path = type.startsWith('R') ? names[i++]! : old;
    if(type.startsWith('R')) previousPaths.set(path,old);
    changedFiles.push({
      path,
      status: type.startsWith('R')
        ? 'renamed'
        : type === 'A'
          ? 'added'
          : type === 'D'
            ? 'deleted'
            : 'modified',
    });
  }
  for (const path of (await git(['ls-files', '--others', '--exclude-standard', '-z']))
    .split('\0')
    .filter(Boolean))
    changedFiles.push({ path, status: 'added' });
  const changed = new Map<string, NodeRef>(),
    affected = new Map<string, NodeRef & { distance: number }>(),
    routes = new Map<string, NodeRef>();
  const features = new Map<
    string,
    { featureId: string; name: string; changed: number; affected: number }
  >();
  for (const f of changedFiles) {
    let indexedPath = f.path;
    let nodes = query.listNodes({ filePath: indexedPath });
    if(!nodes.length && previousPaths.has(f.path)){
      indexedPath = previousPaths.get(f.path)!;
      nodes = query.listNodes({filePath:indexedPath});
    }
    if (!nodes.length) continue;
    const patch = await git([
      'diff',
      '--no-ext-diff',
      '--no-textconv',
      '--unified=0',
      target,
      '--',
      f.path,
    ]);
    const ranges = [...patch.matchAll(/^@@ -([\d]+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm)].map(
      (m) => {
        const start = Number(m[3]);
        return [start, start + Math.max(1, Number(m[4] ?? 1)) - 1] as const;
      },
    );
    for (const n of nodes) {
      if (n.kind === 'symbol') {
        const full = query.getNode(n.id);
        if (
          !ranges.some(([a, b]) => a <= (full.endLine ?? 0) && b >= (full.startLine ?? 1)) &&
          f.status === 'modified'
        )
          continue;
      } else if (n.id !== ids.file(indexedPath)) continue;
      changed.set(n.id, n);
      for (const hit of query.impact(n.id, { direction: 'up', depth: 3 }).nodes) {
        if (hit.distance < (affected.get(hit.id)?.distance ?? Infinity)) affected.set(hit.id, hit);
        if (hit.kind === 'route') routes.set(hit.id, hit);
      }
    }
  }
  for (const id of changed.keys()) affected.delete(id);
  for (const [group, collection] of [
    ['changed', changed],
    ['affected', affected],
  ] as const) {
    for (const n of collection.values())
      for (const f of query.featuresOf(n.id)) {
        const counts = features.get(f.id) ?? {
          featureId: f.id,
          name: f.name,
          changed: 0,
          affected: 0,
        };
        counts[group]++;
        features.set(f.id, counts);
      }
  }
  return {
    base: base ?? 'HEAD',
    head: 'WORKTREE',
    changedFiles,
    changedNodes: [...changed.values()],
    affected: {
      nodes: [...affected.values()],
      features: [...features.values()],
      routes: [...routes.values()],
    },
    flagsTouched: query
      .getHealth()
      .flags.filter((f) => changed.has(f.node.id) || affected.has(f.node.id)),
  };
}
