import { Fragment, createContext, memo, useContext } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { Column, Table } from '../core/model';
import { HEADER_HEIGHT, ROW_HEIGHT } from '../core/layout';

export interface TableNodeData extends Record<string, unknown> {
  table: Table;
}

/**
 * Map from table name -> set of highlighted column names.
 * Provided by MermaidER, consumed by TableNode for hover-driven highlighting
 * without forcing the whole node array to recompute on every hover change.
 */
export const HighlightContext = createContext<ReadonlyMap<string, ReadonlySet<string>>>(new Map());

export interface ColumnSelectionContextValue {
  enabled: boolean;
  /** "table.column" keys for fast lookup. */
  selected: ReadonlySet<string>;
  onToggle: (table: string, column: string, checked: boolean) => void;
}

export const ColumnSelectionContext = createContext<ColumnSelectionContextValue>({
  enabled: false,
  selected: new Set(),
  onToggle: () => undefined,
});

/** When true, column handles become visible/connectable for manual JOIN drawing. */
export const ConnectModeContext = createContext<boolean>(false);

export interface TableActionsContextValue {
  /** When provided, a delete affordance is shown on the table header. */
  onTableRemove?: (table: string) => void;
  /** Per-column click handler. Provided via context (not node data) so its
   *  identity can change without invalidating the React Flow node array. */
  onColumnClick?: (table: string, column: string) => void;
}

export const TableActionsContext = createContext<TableActionsContextValue>({});

const KEY_STYLES: Record<'pk' | 'fk' | 'uk', { label: string; bg: string }> = {
  pk: { label: 'PK', bg: '#f59e0b' },
  fk: { label: 'FK', bg: '#3b82f6' },
  uk: { label: 'UK', bg: '#10b981' },
};

function ColumnRow({
  tableName,
  column,
  highlighted,
  onClick,
  selectionEnabled,
  selected,
  onSelectToggle,
}: {
  tableName: string;
  column: Column;
  highlighted: boolean;
  onClick?: (table: string, column: string) => void;
  selectionEnabled: boolean;
  selected: boolean;
  onSelectToggle: (checked: boolean) => void;
}) {
  const badges: Array<{ label: string; bg: string }> = [];
  if (column.keys.pk) badges.push(KEY_STYLES.pk);
  if (column.keys.fk) badges.push(KEY_STYLES.fk);
  if (column.keys.uk) badges.push(KEY_STYLES.uk);

  return (
    <div
      title={column.comment}
      onClick={onClick ? () => onClick(tableName, column.name) : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '0 10px',
        fontSize: 12,
        fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
        borderTop: '1px solid #eee',
        height: ROW_HEIGHT,
        boxSizing: 'border-box',
        cursor: onClick ? 'pointer' : 'default',
        background: highlighted ? '#fef3c7' : selected ? '#eff6ff' : 'transparent',
        transition: 'background 0.15s',
      }}
    >
      {selectionEnabled && (
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelectToggle(e.target.checked)}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: 13,
            height: 13,
            margin: 0,
            flexShrink: 0,
            cursor: 'pointer',
          }}
        />
      )}
      <span style={{ display: 'flex', gap: 2, flexShrink: 0, minWidth: 18 }}>
        {badges.map((b) => (
          <span
            key={b.label}
            style={{
              display: 'inline-block',
              padding: '0 4px',
              borderRadius: 3,
              background: b.bg,
              color: '#fff',
              fontSize: 9,
              fontWeight: 700,
              lineHeight: '14px',
            }}
          >
            {b.label}
          </span>
        ))}
      </span>
      <span
        style={{
          flexShrink: 0,
          fontWeight: column.keys.pk ? 600 : 400,
          color: '#1f2937',
        }}
      >
        {column.name}
      </span>
      {column.type && (
        <span
          style={{
            flex: 1,
            textAlign: 'right',
            color: '#9ca3af',
            fontStyle: 'italic',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {column.type}
        </span>
      )}
    </div>
  );
}

export const TableNode = memo(function TableNode({ data }: NodeProps) {
  const { table } = data as TableNodeData;
  const highlightMap = useContext(HighlightContext);
  const selection = useContext(ColumnSelectionContext);
  const connectMode = useContext(ConnectModeContext);
  const tableActions = useContext(TableActionsContext);
  const onColumnClick = tableActions.onColumnClick;
  const highlightedCols = highlightMap.get(table.name);
  const headerBg = table.group ? '#1e40af' : '#374151';

  const handleStyle = (extra: { top?: number }): React.CSSProperties => ({
    ...extra,
    width: connectMode ? 9 : 6,
    height: connectMode ? 9 : 6,
    background: connectMode ? '#3b82f6' : 'transparent',
    border: connectMode ? '1.5px solid #fff' : 'none',
    boxShadow: connectMode ? '0 0 0 1px rgba(59,130,246,0.4)' : 'none',
    opacity: connectMode ? 0.85 : 0,
    pointerEvents: connectMode ? 'auto' : 'none',
    cursor: connectMode ? 'crosshair' : 'default',
  });

  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #c4c4c4',
        borderRadius: 6,
        boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
        overflow: 'visible',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
    >
      <Handle
        id="__default-target"
        type="target"
        position={Position.Left}
        style={handleStyle({ top: HEADER_HEIGHT / 2 })}
      />
      <Handle
        id="__default-source"
        type="source"
        position={Position.Right}
        style={handleStyle({ top: HEADER_HEIGHT / 2 })}
      />

      <div
        style={{
          padding: '6px 10px',
          background: headerBg,
          color: '#fff',
          fontWeight: 600,
          fontSize: 13,
          height: HEADER_HEIGHT,
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          borderTopLeftRadius: 6,
          borderTopRightRadius: 6,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {table.name}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {table.group && (
            <span
              style={{
                fontSize: 10,
                opacity: 0.75,
                fontWeight: 400,
                padding: '1px 5px',
                border: '1px solid rgba(255,255,255,0.3)',
                borderRadius: 3,
              }}
            >
              {table.group}
            </span>
          )}
          {tableActions.onTableRemove && (
            <button
              className="nodrag"
              onClick={(e) => {
                e.stopPropagation();
                tableActions.onTableRemove?.(table.name);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              title="Remove this table"
              style={{
                background: 'rgba(255,255,255,0.18)',
                border: 'none',
                color: '#fff',
                width: 18,
                height: 18,
                borderRadius: 3,
                cursor: 'pointer',
                fontSize: 13,
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
        </span>
      </div>

      {table.columns.map((col, i) => {
        const handleY = HEADER_HEIGHT + i * ROW_HEIGHT + ROW_HEIGHT / 2;
        const highlighted = highlightedCols?.has(col.name) ?? false;
        const selectionKey = `${table.name}.${col.name}`;
        const selected = selection.enabled && selection.selected.has(selectionKey);
        return (
          <Fragment key={`${col.name}-${i}`}>
            <Handle
              id={`${col.name}__target`}
              type="target"
              position={Position.Left}
              style={handleStyle({ top: handleY })}
            />
            <Handle
              id={`${col.name}__source`}
              type="source"
              position={Position.Right}
              style={handleStyle({ top: handleY })}
            />
            <ColumnRow
              tableName={table.name}
              column={col}
              highlighted={highlighted}
              onClick={onColumnClick}
              selectionEnabled={selection.enabled}
              selected={selected}
              onSelectToggle={(checked) =>
                selection.onToggle(table.name, col.name, checked)
              }
            />
          </Fragment>
        );
      })}
    </div>
  );
});
