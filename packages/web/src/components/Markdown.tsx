import ReactMarkdown from 'react-markdown';
import type { NodeRef } from '@/api/contract';
import { CitationChip } from './CitationChip';
import { remarkCitations } from './remarkCitations';
import { cn } from '@/lib/cn';

interface MarkdownProps {
  text: string;
  citations?: NodeRef[];
  onSelectCitation?: (id: string) => void;
  className?: string;
}

export function Markdown({
  text,
  citations = [],
  onSelectCitation,
  className,
}: MarkdownProps) {
  const byId = new Map(citations.map((c) => [c.id, c]));

  return (
    <div className={cn('prose-measure text-sm text-[var(--text)] space-y-3', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkCitations]}
        components={{
          p: ({ children }) => <p className="leading-relaxed">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-5 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1">{children}</ol>,
          code: ({ children }) => (
            <code className="rounded bg-[var(--surface-2)] px-1 py-0.5 font-mono text-xs">
              {children}
            </code>
          ),
          ['citation-chip' as string]: (props: { 'data-id'?: string }) => {
            const id = props['data-id'] ?? '';
            return (
              <CitationChip
                id={id}
                nodeRef={byId.get(id)}
                onSelect={onSelectCitation}
              />
            );
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
