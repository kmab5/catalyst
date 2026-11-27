import { useEffect, useRef, useState } from 'react';
import cytoscape, { type Core, type ElementDefinition } from 'cytoscape';
import fcose from 'cytoscape-fcose';
import { Maximize, Minus, Plus } from 'lucide-react';
import type { ImpactDTO } from '@/api/contract';
import { ids } from '@/api/contract';
import { useColorScheme } from '@/lib/useColorScheme';
import { t } from '@/i18n/t';
import { cyStyle } from './cyStyle';
import { impactClasses } from './impactClasses';

cytoscape.use(fcose);
export type HoverNode = { id: string; label: string; x: number; y: number };
interface Props {
  elements: ElementDefinition[];
  selected?: string;
  impact?: ImpactDTO;
  onSelect: (id?: string) => void;
  onOpen: (id: string) => void;
  onHover: (node?: HoverNode) => void;
}

export function GraphCanvas({ elements, selected, impact, onSelect, onOpen, onHover }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const graph = useRef<Core | undefined>(undefined);
  const handlers = useRef({ onSelect, onOpen, onHover });
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const theme = useColorScheme();
  useEffect(() => {
    handlers.current = { onSelect, onOpen, onHover };
  }, [onSelect, onOpen, onHover]);

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const headless = import.meta.env.MODE === 'test';
    const cy = cytoscape({
      headless,
      container: headless ? undefined : el,
      styleEnabled: !headless,
      elements,
      layout: { name: 'preset' },
      style: cyStyle(),
      minZoom: 0.07,
      maxZoom: 4,
    });
    graph.current = cy;
    setFailed(false);
    setBusy(true);
    let layout: cytoscape.Layouts | undefined;
    const timeout = window.setTimeout(() => {
      try {
        layout = cy.layout({
          name: headless ? 'grid' : 'fcose',
          animate: false,
          fit: true,
          padding: 50,
          randomize: true,
        } as cytoscape.LayoutOptions);
        layout.one('layoutstop', () => {
          if (!cy.destroyed()) setBusy(false);
        });
        layout.run();
      } catch {
        setFailed(true);
        setBusy(false);
      }
    }, 0);
    cy.on('tap', (e) => {
      if (e.target === cy) handlers.current.onSelect();
      else if (e.target.isNode()) handlers.current.onSelect(e.target.id());
    });
    cy.on('dbltap', 'node', (e) => {
      const node = e.target as cytoscape.NodeSingular;
      if (node.hasClass('group')) {
        const collapsed = !node.hasClass('collapsed');
        node.toggleClass('collapsed', collapsed);
        node.descendants().toggleClass('collapsed-child', collapsed);
      } else handlers.current.onOpen(node.id());
    });
    cy.on('mouseover', 'node', (e) => {
      const { x, y } = e.target.renderedPosition();
      handlers.current.onHover({ id: e.target.id(), label: e.target.data('label'), x, y });
    });
    cy.on('mouseout pan zoom', () => handlers.current.onHover());
    const observer =
      typeof ResizeObserver === 'function' ? new ResizeObserver(() => cy.resize()) : undefined;
    observer?.observe(el);
    return () => {
      clearTimeout(timeout);
      observer?.disconnect();
      layout?.stop();
      cy.destroy();
      graph.current = undefined;
    };
  }, [elements]);
  useEffect(() => {
    if (import.meta.env.MODE !== 'test') graph.current?.style(cyStyle());
  }, [theme, elements]);
  useEffect(() => {
    const cy = graph.current;
    if (!cy) return;
    const classes = impact ? impactClasses(impact) : new Map<string, 'root' | 'up' | 'down'>();
    if (selected) classes.set(selected, 'root');
    cy.batch(() => {
      cy.elements().removeClass('up down root dimmed');
      if (!selected) return;
      const visible = new Set<string>();
      for (const [id, name] of classes) {
        let node = cy.getElementById(id);
        if (!node.length) {
          try {
            const parsed = ids.parse(id);
            if (parsed.kind === 'symbol' && parsed.path) node = cy.getElementById(ids.file(parsed.path));
          } catch {
            // A malformed focus parameter should not interrupt the rest of the graph.
            continue;
          }
        }
        if (node.length) {
          if (!node.hasClass('root')) node.addClass(name);
          visible.add(node.id());
          for (const parent of node.ancestors().toArray()) visible.add(parent.id());
        }
      }
      cy.nodes().forEach((node) => {
        if (!visible.has(node.id())) node.addClass('dimmed');
      });
      cy.edges().forEach((edge) => {
        if (!visible.has(edge.source().id()) || !visible.has(edge.target().id()))
          edge.addClass('dimmed');
      });
    });
  }, [elements, selected, impact]);

  return (
    <>
      <div className="graph-canvas" ref={container} data-testid="graph-canvas" />
      {busy && (
        <div role="status" className="graph-status">
          {t('graph.layingOut')}
        </div>
      )}
      {failed && (
        <div role="alert" className="graph-status">
          {t('graph.layoutError')}
        </div>
      )}
      <div className="graph-zoom">
        {(
          [
            { key: 'graph.fit', icon: Maximize, run: (cy: Core) => cy.fit(undefined, 50) },
            {
              key: 'graph.zoomIn',
              icon: Plus,
              run: (cy: Core) =>
                cy.zoom({
                  level: cy.zoom() * 1.25,
                  renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
                }),
            },
            {
              key: 'graph.zoomOut',
              icon: Minus,
              run: (cy: Core) =>
                cy.zoom({
                  level: cy.zoom() / 1.25,
                  renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
                }),
            },
          ] as const
        ).map((action) => (
          <button
            type="button"
            key={action.key}
            aria-label={t(action.key)}
            title={t(action.key)}
            onClick={() => graph.current && action.run(graph.current)}
          >
            <action.icon size={15} />
          </button>
        ))}
      </div>
    </>
  );
}
