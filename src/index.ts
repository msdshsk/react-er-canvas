export { MermaidER } from './components/MermaidER';
export type {
  MermaidERHandle,
  MermaidERProps,
  NodePosition,
  NodePositions,
} from './components/MermaidER';
// Data types are exported for theming / custom node-component scenarios.
// The components and contexts themselves are intentionally NOT exported —
// they are tightly coupled to MermaidER's internal context wiring and are
// not safe to use standalone.
export type { TableNodeData } from './components/TableNode';
export type { JoinEdgeData } from './components/JoinEdge';
export * from './core';
