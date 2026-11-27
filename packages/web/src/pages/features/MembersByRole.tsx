import type { FeatureDetailDTO } from '@/api/contract';
import { NodeLink } from '@/components/NodeLink';
import { t } from '@/i18n/t';

const roleNames = {
  entry: 'features.entry',
  core: 'features.core',
  support: 'features.support',
  data: 'features.dataRole',
  ui: 'features.ui',
  config: 'features.config',
  test: 'features.test',
} as const;

export function MembersByRole({ members }: Pick<FeatureDetailDTO, 'members'>) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">{t('features.members')}</h2>
      {Object.entries(roleNames).map(([role, key]) => {
        const group = members.filter((m) => m.role === role);
        return (
          group.length > 0 && (
            <section
              key={role}
              className="grid gap-2 border-t border-[var(--border)] pt-3 md:grid-cols-[9rem_1fr]"
            >
              <h3 className="text-sm font-medium">
                {t(key)} <span className="text-[var(--text-muted)]">({group.length})</span>
              </h3>
              <ul className="space-y-2">
                {group.map((m) => (
                  <li key={m.nodeId}>
                    <NodeLink node={m.node} showPath />
                    {m.reason && <p className="text-xs text-[var(--text-muted)]">{m.reason}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )
        );
      })}
    </section>
  );
}
