import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk-api';
import type { ERModel } from './model';

export type LayoutDirection = 'RIGHT' | 'DOWN' | 'LEFT' | 'UP';

export type LayoutAlgorithm =
  | 'layered'
  | 'stress'
  | 'force'
  | 'mrtree'
  | 'rectpacking'
  | 'radial';

export interface LayoutOptions {
  engine?: 'elk';
  algorithm?: LayoutAlgorithm;
  direction?: LayoutDirection;
  /**
   * Target aspect ratio (width / height). Combined with the layered algorithm,
   * enables wrapping so the layout fits common screen sizes.
   * Example: `16/9`, `Math.SQRT2` for A4 landscape, `1` for square.
   */
  aspectRatio?: number;
  nodeSpacing?: number;
  rankSpacing?: number;
  /** Raw ELK layoutOptions, merged after the defaults. */
  raw?: Record<string, string>;
}

export interface PositionedNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EdgePoint {
  x: number;
  y: number;
}

export interface PositionedEdge {
  id: string;
  source: string;
  target: string;
  startPoint?: EdgePoint;
  endPoint?: EdgePoint;
  bendPoints?: EdgePoint[];
}

export interface LayoutResult {
  nodes: PositionedNode[];
  edges: PositionedEdge[];
  width: number;
  height: number;
}

export const NODE_WIDTH = 240;
export const HEADER_HEIGHT = 32;
export const ROW_HEIGHT = 22;
export const VERTICAL_PADDING = 8;

export function estimateNodeHeight(columnCount: number): number {
  return HEADER_HEIGHT + Math.max(columnCount, 1) * ROW_HEIGHT + VERTICAL_PADDING * 2;
}

export function buildElkLayoutOptions(opts: {
  algorithm: LayoutAlgorithm;
  direction: LayoutDirection;
  aspectRatio: number | undefined;
  nodeSpacing: number;
  rankSpacing: number;
  raw: Record<string, string>;
}): Record<string, string> {
  const out: Record<string, string> = {
    'elk.algorithm': opts.algorithm,
    'elk.spacing.nodeNode': String(opts.nodeSpacing),
  };

  if (opts.aspectRatio !== undefined) {
    out['elk.aspectRatio'] = String(opts.aspectRatio);
  }

  switch (opts.algorithm) {
    case 'layered':
      out['elk.direction'] = opts.direction;
      out['elk.layered.spacing.nodeNodeBetweenLayers'] = String(opts.rankSpacing);
      out['elk.edgeRouting'] = 'ORTHOGONAL';
      if (opts.aspectRatio !== undefined) {
        out['elk.layered.wrapping.strategy'] = 'MULTI_EDGE';
      }
      break;
    case 'mrtree':
      out['elk.direction'] = opts.direction;
      break;
    case 'stress':
      out['elk.stress.desiredEdgeLength'] = String(opts.nodeSpacing * 4);
      break;
    case 'force':
      out['elk.force.repulsivePower'] = '1';
      break;
    case 'rectpacking':
      out['elk.rectpacking.packing.strategy'] = 'SIMPLE';
      break;
    case 'radial':
      // radial defaults
      break;
  }

  return { ...out, ...opts.raw };
}

// Reuse a single ELK instance across calls. Constructing one allocates a heavy
// engine; doing it per layout (i.e., per keystroke in live-editing scenarios)
// is wasteful. ELK's `layout()` is reentrant-safe enough for our usage.
const elk = new ELK();

export async function layoutER(
  model: ERModel,
  options: LayoutOptions = {},
): Promise<LayoutResult> {
  const {
    algorithm = 'layered',
    direction = 'DOWN',
    aspectRatio,
    nodeSpacing = 60,
    rankSpacing = 80,
    raw = {},
  } = options;

  const graph: ElkNode = {
    id: 'root',
    layoutOptions: buildElkLayoutOptions({
      algorithm,
      direction,
      aspectRatio,
      nodeSpacing,
      rankSpacing,
      raw,
    }),
    children: model.tables.map((t) => ({
      id: t.name,
      width: NODE_WIDTH,
      height: estimateNodeHeight(t.columns.length),
    })),
    edges: model.relations.map<ElkExtendedEdge>((r) => ({
      id: r.id,
      sources: [r.from],
      targets: [r.to],
    })),
  };

  const layouted = await elk.layout(graph);

  const nodes: PositionedNode[] = (layouted.children ?? []).map((c) => ({
    id: c.id,
    x: c.x ?? 0,
    y: c.y ?? 0,
    width: c.width ?? NODE_WIDTH,
    height: c.height ?? estimateNodeHeight(0),
  }));

  const layoutedEdges = (layouted.edges ?? []) as ElkExtendedEdge[];
  const edges: PositionedEdge[] = layoutedEdges.map((e) => {
    const section = e.sections?.[0];
    return {
      id: e.id,
      source: e.sources[0],
      target: e.targets[0],
      startPoint: section?.startPoint,
      endPoint: section?.endPoint,
      bendPoints: section?.bendPoints,
    };
  });

  return {
    nodes,
    edges,
    width: layouted.width ?? 0,
    height: layouted.height ?? 0,
  };
}
