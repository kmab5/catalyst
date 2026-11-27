import { Check, Minus } from 'lucide-react';
import type { Flow, NodeRef } from '@/api/contract';
import { NodeIdLink } from '@/components/NodeIdLink';
import { t } from '@/i18n/t';

export function FlowSteps({ flow, nodes }: { flow: Flow; nodes: Map<string, NodeRef> }) {
  return (
    <article className="space-y-2">
      <h3 className="font-semibold">{flow.name}</h3>
      <p className="text-sm text-[var(--text-muted)]">{flow.trigger}</p>
      <ol className="py-2">
        {flow.steps.map((step, i) => (
          <li
            key={i}
            data-testid="flow-step"
            className="relative flex items-start gap-3 pb-4 last:pb-0"
          >
            <span className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-xs tabular-nums">
              {i + 1}
            </span>
            {i > 0 && (
              <span
                aria-hidden="true"
                data-testid="flow-hop"
                data-verified={step.edgeVerified}
                className={`absolute bottom-full left-3 h-5 border-l border-[var(--text-muted)] ${step.edgeVerified ? '' : 'border-dashed'}`}
              />
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <NodeIdLink id={step.nodeId} node={nodes.get(step.nodeId)} />
                <span
                  title={step.edgeVerified ? undefined : t('features.inferredHint')}
                  className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)]"
                >
                  {step.edgeVerified ? <Check size={12} /> : <Minus size={12} />}
                  {t(step.edgeVerified ? 'features.linked' : 'features.inferred')}
                </span>
              </div>
              <p className="mt-1 text-sm">{step.action}</p>
            </div>
          </li>
        ))}
      </ol>
    </article>
  );
}
