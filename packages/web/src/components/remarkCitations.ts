const CITATION_RE = /\[\[([^\]]+)\]\]/g;

interface MdastNode {
  type: string;
  value?: string;
  children?: MdastNode[];
  data?: Record<string, unknown>;
}

function walk(node: MdastNode) {
  if (!node.children) return;
  const next: MdastNode[] = [];
  for (const child of node.children) {
    if (child.type === 'text' && typeof child.value === 'string') {
      const text = child.value;
      let lastIndex = 0;
      CITATION_RE.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = CITATION_RE.exec(text)) !== null) {
        if (match.index > lastIndex) {
          next.push({ type: 'text', value: text.slice(lastIndex, match.index) });
        }
        const id = match[1]!;
        next.push({
          type: 'citation',
          data: {
            hName: 'citation-chip',
            hProperties: { 'data-id': id },
          },
        });
        lastIndex = match.index + match[0].length;
      }
      if (lastIndex < text.length) {
        next.push({ type: 'text', value: text.slice(lastIndex) });
      }
    } else {
      walk(child);
      next.push(child);
    }
  }
  node.children = next;
}

export function remarkCitations() {
  return (tree: MdastNode) => {
    walk(tree);
  };
}
