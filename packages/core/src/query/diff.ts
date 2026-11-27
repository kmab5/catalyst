import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
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
  function runGit(args: string[]) {
    const command = exec('git', ['--literal-pathspecs', ...args], {
      cwd: root,
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, LC_ALL: 'C' },
    });
    command.child.stdin?.end();
    return command.then((result) => result.stdout);
  }
  function git(args: string[]) {
    return runGit(args).catch(() => {
      throw new CatalystError('BAD_REQUEST', 'Git could not read the changes in this project.');
    });
  }
  const unavailable = (reason: NonNullable<DiffImpactDTO['unavailable']>) => ({
    base: base ?? 'HEAD',
    head: 'WORKTREE',
    unavailable: reason,
    changedFiles: [],
    changedNodes: [],
    affected: { nodes: [], features: [], routes: [] },
    flagsTouched: [],
  });
  try {
    if ((await runGit(['rev-parse', '--is-inside-work-tree'])).trim() !== 'true')
      return unavailable('not-a-work-tree');
  } catch (error) {
    const failure = error as { code?: string; stderr?: string };
    if (failure.code === 'ENOENT') {
      if (!(await stat(root).catch(() => null))?.isDirectory())
        throw new CatalystError('BAD_REQUEST', 'The project folder is no longer available.');
      return unavailable('git-not-installed');
    }
    if (failure.stderr?.includes('not a git repository')) return unavailable('not-a-work-tree');
    throw new CatalystError('BAD_REQUEST', 'Git could not open this working tree. Check access to the project folder.');
  }
  const head = (await runGit(['rev-parse', '--verify', '--quiet', 'HEAD^{commit}']).catch((error) => {
    if (error.code === 1) return '';
    throw new CatalystError('BAD_REQUEST', 'Git could not read HEAD.');
  })).trim();
  let target = head;
  if (base) {
    if (!head) throw new CatalystError('BAD_REQUEST', 'Create the first commit before comparing branches.');
    const revision = await runGit(['rev-parse', '--verify', '--end-of-options', base + '^{commit}']).catch(() => {
      throw new CatalystError('BAD_REQUEST', 'Git could not find that branch, tag, or commit.');
    });
    target = (await runGit(['merge-base', revision.trim(), head]).catch(() => {
      throw new CatalystError('BAD_REQUEST', 'The selected commit and HEAD have no common ancestor.');
    })).trim();
  } else if (!head) {
    // Git recognizes the empty tree in both SHA-1 and SHA-256 repositories.
    target = (await git(['hash-object', '-t', 'tree', '--stdin'])).trim();
  }
  const names = (
    await git(['diff', '--relative', '--no-ext-diff', '--name-status', '-z', '-M', target, '--', '.'])
  ).split('\0');
  const changedFiles: DiffImpactDTO['changedFiles'] = [];
  const previousPaths = new Map<string, string>();
  for (let i = 0; i < names.length && names[i]; ) {
    const type = names[i++]!,
      old = names[i++]!,
      path = type.startsWith('R') ? names[i++]! : old;
    if (type.startsWith('R')) previousPaths.set(path, old);
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
  for (const path of (await git(['ls-files', '--others', '--exclude-standard', '-z', '--', '.']))
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
    if (!nodes.length && previousPaths.has(f.path)) {
      indexedPath = previousPaths.get(f.path)!;
      nodes = query.listNodes({ filePath: indexedPath });
    }
    if (!nodes.length) continue;
    const needsHunks = f.status === 'modified' && nodes.some((n) => n.kind === 'symbol');
    const patch = needsHunks
      ? await git(['diff', '--no-ext-diff', '--no-textconv', '--unified=0', target, '--', f.path])
      : '';
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
    base: base ?? (head ? 'HEAD' : 'EMPTY_TREE'),
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
