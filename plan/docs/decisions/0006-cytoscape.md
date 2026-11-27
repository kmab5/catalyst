# ADR-0006: Cytoscape.js for the main graph, React Flow for flow diagrams

- **Status:** Accepted
- **Date:** 2026-11-27

## Context
The main graph can have hundreds to thousands of nodes and needs clustering (folders/features as collapsible groups), fast highlighting of the blast radius, and automatic layout. Flow diagrams are small and should look polished.

## Decision
Use Cytoscape.js with the `cytoscape-fcose` layout and compound nodes for the main Graph view. Use React Flow + ELK only for per-feature flow diagrams (Stretch).

## Consequences
- Handles large graphs and grouping without writing our own layout code.
- Less 'pretty by default' than React Flow, so we need a small styling pass.
- Two graph libraries in the bundle, which is acceptable.
