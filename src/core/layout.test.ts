import { describe, expect, it } from 'vitest';
import {
  buildElkLayoutOptions,
  estimateNodeHeight,
  HEADER_HEIGHT,
  layoutER,
  NODE_WIDTH,
  ROW_HEIGHT,
  VERTICAL_PADDING,
} from './layout';

describe('estimateNodeHeight', () => {
  it('produces header + rows + padding for typical column counts', () => {
    expect(estimateNodeHeight(0)).toBe(HEADER_HEIGHT + ROW_HEIGHT + VERTICAL_PADDING * 2);
    expect(estimateNodeHeight(1)).toBe(HEADER_HEIGHT + ROW_HEIGHT + VERTICAL_PADDING * 2);
    expect(estimateNodeHeight(5)).toBe(HEADER_HEIGHT + 5 * ROW_HEIGHT + VERTICAL_PADDING * 2);
  });

  it('treats empty tables as having one virtual row to keep them visible', () => {
    expect(estimateNodeHeight(0)).toBe(estimateNodeHeight(1));
  });
});

describe('buildElkLayoutOptions — algorithm-specific keys', () => {
  const base = {
    direction: 'DOWN' as const,
    aspectRatio: undefined,
    nodeSpacing: 60,
    rankSpacing: 80,
    raw: {},
  };

  it('emits layered-specific options when algorithm = layered', () => {
    const opts = buildElkLayoutOptions({ ...base, algorithm: 'layered' });
    expect(opts['elk.algorithm']).toBe('layered');
    expect(opts['elk.direction']).toBe('DOWN');
    expect(opts['elk.layered.spacing.nodeNodeBetweenLayers']).toBe('80');
    expect(opts['elk.edgeRouting']).toBe('ORTHOGONAL');
    expect(opts['elk.spacing.nodeNode']).toBe('60');
  });

  it('attaches wrapping strategy when aspectRatio is set with layered', () => {
    const opts = buildElkLayoutOptions({
      ...base,
      algorithm: 'layered',
      aspectRatio: 16 / 9,
    });
    expect(opts['elk.aspectRatio']).toBe(String(16 / 9));
    expect(opts['elk.layered.wrapping.strategy']).toBe('MULTI_EDGE');
  });

  it('omits wrapping strategy when aspectRatio is unset', () => {
    const opts = buildElkLayoutOptions({ ...base, algorithm: 'layered' });
    expect(opts['elk.aspectRatio']).toBeUndefined();
    expect(opts['elk.layered.wrapping.strategy']).toBeUndefined();
  });

  it('emits direction for mrtree but not other layered-only options', () => {
    const opts = buildElkLayoutOptions({ ...base, algorithm: 'mrtree' });
    expect(opts['elk.algorithm']).toBe('mrtree');
    expect(opts['elk.direction']).toBe('DOWN');
    expect(opts['elk.layered.spacing.nodeNodeBetweenLayers']).toBeUndefined();
  });

  it('emits desiredEdgeLength for stress', () => {
    const opts = buildElkLayoutOptions({ ...base, algorithm: 'stress' });
    expect(opts['elk.algorithm']).toBe('stress');
    expect(opts['elk.stress.desiredEdgeLength']).toBe(String(60 * 4));
    expect(opts['elk.direction']).toBeUndefined();
  });

  it('emits packing strategy for rectpacking', () => {
    const opts = buildElkLayoutOptions({ ...base, algorithm: 'rectpacking' });
    expect(opts['elk.algorithm']).toBe('rectpacking');
    expect(opts['elk.rectpacking.packing.strategy']).toBe('SIMPLE');
  });

  it('lets raw options override built-in defaults', () => {
    const opts = buildElkLayoutOptions({
      ...base,
      algorithm: 'layered',
      raw: { 'elk.direction': 'RIGHT', 'elk.foo': 'bar' },
    });
    expect(opts['elk.direction']).toBe('RIGHT');
    expect(opts['elk.foo']).toBe('bar');
  });
});

describe('layoutER — basic ELK integration', () => {
  it('returns positioned nodes and edges for a small connected graph', async () => {
    const result = await layoutER({
      tables: [
        { name: 'A', columns: [] },
        { name: 'B', columns: [] },
        { name: 'C', columns: [] },
      ],
      relations: [
        {
          id: 'a-b',
          from: 'A',
          to: 'B',
          fromCardinality: 'one',
          toCardinality: 'zero-or-many',
          identifying: true,
        },
        {
          id: 'b-c',
          from: 'B',
          to: 'C',
          fromCardinality: 'one',
          toCardinality: 'zero-or-many',
          identifying: true,
        },
      ],
      groups: [],
    });
    expect(result.nodes.map((n) => n.id).sort()).toEqual(['A', 'B', 'C']);
    expect(result.edges.map((e) => e.id).sort()).toEqual(['a-b', 'b-c']);
    for (const n of result.nodes) {
      expect(n.width).toBe(NODE_WIDTH);
      expect(n.height).toBeGreaterThan(0);
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
    }
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  it('handles isolated tables (no relations)', async () => {
    const result = await layoutER({
      tables: [
        { name: 'X', columns: [] },
        { name: 'Y', columns: [] },
      ],
      relations: [],
      groups: [],
    });
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(0);
  });
});
