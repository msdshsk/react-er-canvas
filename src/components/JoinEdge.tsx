import { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from '@xyflow/react';
import type { JoinType } from '../core/model';

export interface JoinEdgeData extends Record<string, unknown> {
  type: JoinType;
  color: string;
  /** Optional override for the edge stroke width. Defaults to 2 / 2.5 (when emphasized). */
  strokeWidth?: number;
  /** Optional override for the edge dasharray. Defaults to '6 3' (dashed). Pass '' for solid. */
  strokeDasharray?: string;
  hovered?: boolean;
  onDelete?: () => void;
}

export const JoinEdge = memo(function JoinEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const d = (data ?? {}) as JoinEdgeData;
  const emphasized = !!selected || !!d.hovered;
  const color = d.color || '#3b82f6';

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: color,
          strokeWidth: d.strokeWidth ?? (emphasized ? 2.5 : 2),
          strokeDasharray: d.strokeDasharray ?? '6 3',
        }}
      />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan"
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            background: color,
            color: '#fff',
            fontSize: 10,
            fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
            fontWeight: 700,
            borderRadius: 3,
            padding: '2px 4px 2px 6px',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            pointerEvents: 'all',
            boxShadow: emphasized
              ? '0 0 0 2px rgba(0,0,0,0.4)'
              : '0 1px 2px rgba(0,0,0,0.15)',
            userSelect: 'none',
          }}
        >
          <span>{d.type}</span>
          {d.onDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                d.onDelete?.();
              }}
              onMouseDown={(e) => e.stopPropagation()}
              title="Remove this JOIN"
              style={{
                background: 'rgba(255,255,255,0.25)',
                border: 'none',
                color: '#fff',
                width: 14,
                height: 14,
                borderRadius: 2,
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 700,
                padding: 0,
                lineHeight: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ×
            </button>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
});
