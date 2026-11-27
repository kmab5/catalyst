export function validateCitations(markdown: string, exists: (id: string) => boolean) {
  const citations = new Set<string>();
  // Match balanced route segments inside a citation, including Next's optional catch-all.
  const text = markdown.replace(/\[\[((?:[^\[\]\n]|\[(?:[^\[\]\n]|\[[^\[\]\n]*\])*\])+)\]\]/g, (_match, id: string) => {
    if (!exists(id)) return id.slice(id.indexOf(':') + 1);
    citations.add(id);
    return '[[' + id + ']]';
  });
  return { markdown: text, citations: [...citations] };
}
export function cleanStrings<T>(value: T, exists: (id: string) => boolean): T {
  return JSON.parse(
    JSON.stringify(value, (_k, v: unknown) =>
      typeof v === 'string' ? validateCitations(v, exists).markdown : v,
    ),
  );
}
