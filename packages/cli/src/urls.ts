import type { ProjectDTO } from '@catalyst/shared';

export function launchUrl(
  base: string,
  project: ProjectDTO | null,
  opts?: { suggest?: string },
): string {
  const url = new URL('/', base);
  if (project) {
    const page =
      project.status === 'indexing' || project.status === 'never-indexed' ? 'indexing' : 'overview';
    url.pathname = '/p/' + encodeURIComponent(project.id) + '/' + page;
  } else if (opts?.suggest) {
    url.searchParams.set('suggest', opts.suggest);
  }
  return url.href;
}
