import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  type Connection,
  type Edge,
  type EdgeTypes,
  type Node,
  type NodeTypes,
} from '@xyflow/react';
// React Flow's CSS is intentionally NOT imported here. Consumers must add it
// once at their app entry point: `import '@xyflow/react/dist/style.css';`.
// Importing it from this file would cause double-injection in apps that
// already use React Flow, and inflate this library's bundled assets.
import { parseMermaidER, MermaidERParseError } from '../core/parser';
import {
  layoutER,
  type LayoutAlgorithm,
  type LayoutDirection,
  type LayoutResult,
} from '../core/layout';
import type {
  ColumnRef,
  ERModel,
  Join,
  PartialColumnRef,
  Relation,
} from '../core/model';
import {
  ColumnSelectionContext,
  ConnectModeContext,
  HighlightContext,
  TableActionsContext,
  TableNode,
  type ColumnSelectionContextValue,
  type TableActionsContextValue,
  type TableNodeData,
} from './TableNode';
import { JoinEdge, type JoinEdgeData } from './JoinEdge';

const nodeTypes: NodeTypes = {
  table: TableNode,
};

const edgeTypes: EdgeTypes = {
  joinEdge: JoinEdge,
};

export interface NodePosition {
  x: number;
  y: number;
}

export type NodePositions = Record<string, NodePosition>;

export interface MermaidERProps {
  /** Mermaid ER source. Mutually exclusive with `model`. */
  source?: string;
  /** Pre-built ER model. Takes precedence over `source`. */
  model?: ERModel;
  layout?: 'elk';
  algorithm?: LayoutAlgorithm;
  direction?: LayoutDirection;
  aspectRatio?: number;
  positions?: NodePositions;
  onPositionsChange?: (positions: NodePositions) => void;
  showColumnCheckboxes?: boolean;
  selectedColumns?: ColumnRef[];
  onColumnSelectionChange?: (selectedColumns: ColumnRef[]) => void;
  /** Enable column-to-column / card-to-card drag for manual JOINs. */
  enableManualJoins?: boolean;
  /** Existing manual joins to render alongside FK relations. */
  joins?: Join[];
  /**
   * Fired when the user finishes a connect drag. The consumer typically opens
   * a dialog to ask for join type, then appends a complete `Join` to its state.
   * `column` may be undefined when the drag landed on a default (table-center) handle.
   */
  onJoinConnect?: (source: PartialColumnRef, target: PartialColumnRef) => void;
  /** Fired when the user removes a manual join via Delete or the trash icon. */
  onJoinDelete?: (joinId: string) => void;
  /** When provided, a small × appears on each table header to remove it from the canvas. */
  onTableRemove?: (table: string) => void;
  highlightReferencesOnHover?: boolean;
  onColumnClick?: (table: string, column: string) => void;
  onTableClick?: (table: string) => void;
  /** Override the default delete-key code(s). Default is 'Delete' (Backspace ignored to prevent accidents). */
  deleteKeyCode?: string | string[] | null;
  className?: string;
  style?: CSSProperties;
}

interface ParseState {
  model: ERModel | null;
  error: MermaidERParseError | null;
}

function safeParse(source: string): ParseState {
  try {
    return { model: parseMermaidER(source), error: null };
  } catch (e) {
    if (e instanceof MermaidERParseError) {
      return { model: null, error: e };
    }
    throw e;
  }
}

function handleIdFor(side: 'source' | 'target', column: string | undefined): string {
  return column ? `${column}__${side}` : `__default-${side}`;
}

const JOIN_EDGE_PREFIX = 'join:';

function parseHandleColumn(handleId: string | null | undefined): string | undefined {
  if (!handleId) return undefined;
  if (handleId.startsWith('__default-')) return undefined;
  const m = /^(.+)__(?:source|target)$/.exec(handleId);
  return m ? m[1] : undefined;
}

function refKey(ref: ColumnRef): string {
  return `${ref.table}.${ref.column}`;
}

const JOIN_TYPE_COLOR: Record<Join['type'], string> = {
  INNER: '#3b82f6',
  LEFT: '#8b5cf6',
  RIGHT: '#a855f7',
  FULL: '#ec4899',
  CROSS: '#6b7280',
};

export function MermaidER(props: MermaidERProps) {
  const {
    source,
    model: modelProp,
    algorithm,
    direction,
    aspectRatio,
    positions,
    onPositionsChange,
    showColumnCheckboxes,
    selectedColumns,
    onColumnSelectionChange,
    enableManualJoins,
    joins,
    onJoinConnect,
    onJoinDelete,
    onTableRemove,
    onColumnClick,
    onTableClick,
    deleteKeyCode = 'Delete',
    className,
    style,
    highlightReferencesOnHover = true,
  } = props;

  const { model, error } = useMemo<ParseState>(() => {
    if (modelProp) return { model: modelProp, error: null };
    if (source != null) return safeParse(source);
    return { model: null, error: null };
  }, [source, modelProp]);

  const [layout, setLayout] = useState<LayoutResult | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);

  useEffect(() => {
    if (!model) {
      setLayout(null);
      return;
    }
    let cancelled = false;
    layoutER(model, { algorithm, direction, aspectRatio }).then((result) => {
      if (!cancelled) setLayout(result);
    });
    return () => {
      cancelled = true;
    };
  }, [model, algorithm, direction, aspectRatio]);

  const baseNodes = useMemo<Node[]>(() => {
    if (!layout || !model) return [];
    const tableMap = new Map(model.tables.map((t) => [t.name, t]));
    const result: Node[] = [];
    for (const n of layout.nodes) {
      const table = tableMap.get(n.id);
      // Skip stale nodes: a model update can arrive before the new layout
      // finishes; in that gap, layout may still reference a removed table.
      if (!table) continue;
      const override = positions?.[n.id];
      const data: TableNodeData = { table };
      result.push({
        id: n.id,
        type: 'table',
        position: override ?? { x: n.x, y: n.y },
        data,
        width: n.width,
        height: n.height,
        draggable: true,
        deletable: false,
      });
    }
    return result;
    // `onColumnClick` is intentionally NOT a dep — it flows via TableActionsContext
    // so a non-stable callback identity from the parent doesn't reset React Flow
    // node state (which would clobber an in-flight drag).
  }, [layout, model, positions]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(baseNodes);

  useEffect(() => {
    setNodes(baseNodes);
  }, [baseNodes, setNodes]);

  const handleNodeDragStop = useCallback(
    (_: unknown, _primary: Node, dragged: Node[]) => {
      if (!onPositionsChange) return;
      const next: NodePositions = { ...(positions ?? {}) };
      for (const n of dragged) {
        next[n.id] = { x: n.position.x, y: n.position.y };
      }
      onPositionsChange(next);
    },
    [positions, onPositionsChange],
  );

  const hoveredRelation = useMemo<Relation | undefined>(() => {
    if (!hoveredEdgeId || !model) return undefined;
    return model.relations.find((r) => r.id === hoveredEdgeId);
  }, [hoveredEdgeId, model]);

  const hoveredJoin = useMemo<Join | undefined>(() => {
    if (!hoveredEdgeId || !joins) return undefined;
    if (!hoveredEdgeId.startsWith(JOIN_EDGE_PREFIX)) return undefined;
    const id = hoveredEdgeId.slice(JOIN_EDGE_PREFIX.length);
    return joins.find((j) => j.id === id);
  }, [hoveredEdgeId, joins]);

  const highlightMap = useMemo<ReadonlyMap<string, ReadonlySet<string>>>(() => {
    const map = new Map<string, Set<string>>();
    if (!highlightReferencesOnHover) return map;

    const add = (table: string, column: string | undefined) => {
      if (!column) return;
      const set = map.get(table) ?? new Set();
      set.add(column);
      map.set(table, set);
    };

    if (hoveredRelation) {
      add(hoveredRelation.from, hoveredRelation.fromColumn);
      add(hoveredRelation.to, hoveredRelation.toColumn);
    }
    if (hoveredJoin) {
      add(hoveredJoin.source.table, hoveredJoin.source.column);
      add(hoveredJoin.target.table, hoveredJoin.target.column);
    }
    return map;
  }, [hoveredRelation, hoveredJoin, highlightReferencesOnHover]);

  const selectionSet = useMemo<ReadonlySet<string>>(() => {
    return new Set((selectedColumns ?? []).map(refKey));
  }, [selectedColumns]);

  const handleColumnSelectToggle = useCallback(
    (table: string, column: string, checked: boolean) => {
      if (!onColumnSelectionChange) return;
      const list = selectedColumns ?? [];
      if (checked) {
        if (list.some((r) => r.table === table && r.column === column)) return;
        onColumnSelectionChange([...list, { table, column }]);
      } else {
        onColumnSelectionChange(
          list.filter((r) => !(r.table === table && r.column === column)),
        );
      }
    },
    [selectedColumns, onColumnSelectionChange],
  );

  const selectionContext = useMemo<ColumnSelectionContextValue>(
    () => ({
      enabled: showColumnCheckboxes ?? false,
      selected: selectionSet,
      onToggle: handleColumnSelectToggle,
    }),
    [showColumnCheckboxes, selectionSet, handleColumnSelectToggle],
  );

  const edges = useMemo<Edge[]>(() => {
    if (!layout || !model) return [];
    const tableSet = new Set(model.tables.map((t) => t.name));
    const relMap = new Map(model.relations.map((r) => [r.id, r]));

    const fkEdges: Edge[] = [];
    for (const e of layout.edges) {
      // Skip stale edges referencing tables removed since the layout was computed.
      if (!tableSet.has(e.source) || !tableSet.has(e.target)) continue;
      const rel = relMap.get(e.id);
      const isHovered = e.id === hoveredEdgeId;
      fkEdges.push({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: handleIdFor('source', rel?.fromColumn),
        targetHandle: handleIdFor('target', rel?.toColumn),
        type: 'smoothstep',
        animated: isHovered,
        deletable: false,
        style: {
          stroke: isHovered ? '#f59e0b' : '#9ca3af',
          strokeWidth: isHovered ? 2 : 1.5,
        },
        label: rel?.label,
        labelStyle: { fontSize: 10, fill: '#6b7280' },
        labelBgStyle: { fill: '#fff', fillOpacity: 0.85 },
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 3,
      });
    }

    const joinEdges: Edge[] = [];
    for (const j of joins ?? []) {
      if (!tableSet.has(j.source.table) || !tableSet.has(j.target.table)) continue;
      const edgeId = `${JOIN_EDGE_PREFIX}${j.id}`;
      const isHovered = edgeId === hoveredEdgeId;
      const color = JOIN_TYPE_COLOR[j.type] ?? '#3b82f6';
      const data: JoinEdgeData = {
        type: j.type,
        color,
        hovered: isHovered,
        onDelete: onJoinDelete ? () => onJoinDelete(j.id) : undefined,
      };
      joinEdges.push({
        id: edgeId,
        source: j.source.table,
        target: j.target.table,
        sourceHandle: handleIdFor('source', j.source.column),
        targetHandle: handleIdFor('target', j.target.column),
        type: 'joinEdge',
        deletable: true,
        data: data as unknown as Record<string, unknown>,
      });
    }

    return [...fkEdges, ...joinEdges];
  }, [layout, model, joins, hoveredEdgeId, onJoinDelete]);

  const handleConnect = useCallback(
    (conn: Connection) => {
      if (!onJoinConnect) return;
      if (!conn.source || !conn.target) return;
      onJoinConnect(
        { table: conn.source, column: parseHandleColumn(conn.sourceHandle) },
        { table: conn.target, column: parseHandleColumn(conn.targetHandle) },
      );
    },
    [onJoinConnect],
  );

  const handleEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      if (!onJoinDelete) return;
      for (const e of deleted) {
        if (e.id.startsWith(JOIN_EDGE_PREFIX)) {
          onJoinDelete(e.id.slice(JOIN_EDGE_PREFIX.length));
        }
      }
    },
    [onJoinDelete],
  );

  const connectModeOn = !!enableManualJoins;
  const tableActions = useMemo<TableActionsContextValue>(
    () => ({ onTableRemove, onColumnClick }),
    [onTableRemove, onColumnClick],
  );

  return (
    <div
      className={className}
      style={{ width: '100%', height: '100%', position: 'relative', ...style }}
    >
      {error && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            right: 8,
            zIndex: 10,
            padding: '8px 12px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 6,
            color: '#991b1b',
            fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
            fontSize: 12,
            whiteSpace: 'pre-wrap',
          }}
        >
          {error.message}
        </div>
      )}
      {!error && !layout && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#9ca3af',
            fontSize: 13,
          }}
        >
          Computing layout…
        </div>
      )}
      <HighlightContext.Provider value={highlightMap}>
        <ColumnSelectionContext.Provider value={selectionContext}>
          <ConnectModeContext.Provider value={connectModeOn}>
            <TableActionsContext.Provider value={tableActions}>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                fitView
                onNodesChange={onNodesChange}
                onNodeDragStop={handleNodeDragStop}
                onNodeClick={
                  onTableClick ? (_, node) => onTableClick(node.id) : undefined
                }
                onEdgeMouseEnter={(_, edge) => setHoveredEdgeId(edge.id)}
                onEdgeMouseLeave={() => setHoveredEdgeId(null)}
                onConnect={handleConnect}
                onEdgesDelete={handleEdgesDelete}
                nodesDraggable
                nodesConnectable={connectModeOn}
                elementsSelectable
                deleteKeyCode={deleteKeyCode}
                minZoom={0.1}
                maxZoom={4}
              >
                <Background />
                <Controls />
                <MiniMap pannable zoomable />
              </ReactFlow>
            </TableActionsContext.Provider>
          </ConnectModeContext.Provider>
        </ColumnSelectionContext.Provider>
      </HighlightContext.Provider>
    </div>
  );
}
