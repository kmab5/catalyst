import { lazy, Suspense, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { useFeatures, useNode, useTree } from '@/api/hooks/queries';
import { EmptyState } from '@/components/EmptyState';
import { ErrorCard } from '@/components/ErrorCard';
import { PageSkeleton } from '@/components/Skeleton';
import { t } from '@/i18n/t';
import { FileTree } from './explorer/FileTree';
import { SourceView } from './explorer/SourceView';

import './explorer/explorer.css';

const XRayPanel = lazy(() =>
  import('./explorer/XRayPanel').then((module) => ({ default: module.XRayPanel })),
);

export function Explorer() {
  const { pid } = useParams<{ pid: string }>();
  const [params, setParams] = useSearchParams();
  const nodeId = params.get('node') || undefined;
  const requested = Number(params.get('line'));
  const line = Number.isSafeInteger(requested) && requested > 0 ? requested : undefined;
  const tree = useTree(pid);
  const features = useFeatures(pid);
  const xray = useNode(pid, nodeId);
  const [dismissed, setDismissed] = useState<string>();
  function select(id: string, line?: number) {
    setParams(line ? { node: id, line: String(line) } : { node: id });
    setDismissed(undefined);
  }
  return (
    <div className="explorer" data-testid="page-explorer">
      {tree.data ? (
        <FileTree
          tree={tree.data}
          features={features.data ?? []}
          selectedPath={xray.data?.node.filePath}
          onSelect={select}
        />
      ) : tree.error ? (
        <ErrorCard error={tree.error} onRetry={() => void tree.refetch()} />
      ) : (
        <PageSkeleton />
      )}
      <div className="min-w-0">
        {!nodeId ? (
          <EmptyState title={t('explorer.choose')} body={t('explorer.chooseHelp')} />
        ) : xray.error ? (
          <ErrorCard error={xray.error} onRetry={() => void xray.refetch()} />
        ) : xray.data && pid ? (
          <SourceView
            pid={pid}
            xray={xray.data}
            line={line}
            onSelect={select}
            onInspect={() => setDismissed(undefined)}
          />
        ) : (
          <PageSkeleton />
        )}
      </div>
      {nodeId && xray.data && (
        <div className={dismissed === nodeId ? 'xray-column is-dismissed' : 'xray-column'}>
          <Suspense fallback={<PageSkeleton />}>
            <XRayPanel key={nodeId} nodeId={nodeId} onClose={() => setDismissed(nodeId)} />
          </Suspense>
        </div>
      )}
    </div>
  );
}
