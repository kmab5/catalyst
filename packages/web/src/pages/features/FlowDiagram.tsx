import { useEffect, useState } from 'react';
import { ReactFlow, Background, Controls, Position, type Node, type Edge } from '@xyflow/react';
import ELK from 'elkjs/lib/elk.bundled.js';
import '@xyflow/react/dist/style.css';
import { ids, type Flow, type NodeRef } from '@/api/contract';
import { t } from '@/i18n/t';
import { useColorScheme } from '@/lib/useColorScheme';
import { NodeIdLink } from '@/components/NodeIdLink';
import { FlowSteps } from './FlowSteps';
import { flowToGraph } from './flow-graph';

const elk = new ELK();
const kindColor = {
  directory: 0,
  file: 1,
  symbol: 2,
  route: 3,
  db_model: 4,
  env_var: 5,
  package: 6,
  service: 7,
  feature: 0,
};
const width = 208,
  height = 106;

export default function FlowDiagram({ flow, nodes }: { flow: Flow; nodes: Map<string, NodeRef> }) {
  const theme = useColorScheme();
  const [layout, setLayout] = useState<{ nodes: Node[]; edges: Edge[] }>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    const graph = flowToGraph(flow);
    setLayout(undefined);
    setFailed(false);
    void elk
      .layout({
        id: 'flow',
        layoutOptions: {
          'elk.algorithm': 'layered',
          'elk.direction': 'RIGHT',
          'elk.layered.spacing.nodeNodeBetweenLayers': '52',
        },
        children: graph.nodes.map(({ id }) => ({ id, width, height })),
        edges: graph.edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
      })
      .then((result) => {
        if (!live) return;
        const positions = new Map(
          result.children?.map((n) => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }]),
        );
        setLayout({
          nodes: graph.nodes.map(({ id, step, index }) => ({
            id,
            position: positions.get(id) ?? { x: index * (width + 52), y: 0 },
            sourcePosition: Position.Right,
            targetPosition: Position.Left,
            style: {
              width,
              height,
              borderColor: `var(--feature-${kindColor[ids.kindOf(step.nodeId)]})`,
              background: 'var(--surface)',
              color: 'var(--text)',
            },
            data: {
              label: (
                <div className="space-y-1 overflow-hidden text-left">
                  <span className="text-xs text-[var(--text-muted)]">
                    {index + 1} · {ids.kindOf(step.nodeId)}
                  </span>
                  <div>
                    <NodeIdLink id={step.nodeId} node={nodes.get(step.nodeId)} />
                  </div>
                  <p className="line-clamp-2 text-xs" title={step.action}>
                    {step.action}
                  </p>
                </div>
              ),
            },
          })),
          edges: graph.edges.map((e) => ({
            ...e,
            type: 'straight',
            label: t(e.verified ? 'features.linked' : 'features.inferred'),
            style: { stroke: 'var(--text-muted)', strokeDasharray: e.verified ? undefined : '5 4' },
            labelBgStyle: { fill: 'var(--bg)' },
            labelStyle: { fill: 'var(--text-muted)', fontSize: 10 },
          })),
        });
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [flow, nodes]);
  if (failed) return <FlowSteps flow={flow} nodes={nodes} />;
  return (
    <section>
      <h3 className="font-semibold">{flow.name}</h3>
      <p className="mb-2 text-sm text-[var(--text-muted)]">{flow.trigger}</p>
      <div className="h-72 overflow-hidden rounded-md border border-[var(--border)]">
        {layout ? (
          <ReactFlow
            className={theme}
            nodes={layout.nodes}
            edges={layout.edges}
            fitView
            minZoom={0.15}
            nodesDraggable={false}
            nodesConnectable={false}
            onlyRenderVisibleElements
            aria-label={flow.name}
          >
            <Background />
            <Controls showInteractive={false} />
          </ReactFlow>
        ) : (
          <p className="p-4 text-sm text-[var(--text-muted)]">{t('graph.layingOut')}</p>
        )}
      </div>
    </section>
  );
}
