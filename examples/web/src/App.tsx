import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  MermaidER,
  parseMermaidER,
  MermaidERParseError,
  type ColumnRef,
  type ERModel,
  type Join,
  type JoinType,
  type LayoutAlgorithm,
  type LayoutDirection,
  type NodePositions,
  type PartialColumnRef,
} from '@msdshsk/react-er-canvas';
import ecommerceSample from './sample.mmd?raw';

const SIMPLE_SAMPLE = `erDiagram
    %% @group public
    CUSTOMER ||--o{ ORDER : places
    CUSTOMER {
        int id PK "Customer ID"
        string name
        string email UK
    }
    ORDER {
        int id PK
        int customer_id FK
        decimal amount
        timestamp created_at
    }
    %% @endgroup

    LINEITEM }o--|| ORDER : "belongs to"
    LINEITEM {
        int id PK
        int order_id FK
        int product_id FK
        int quantity
    }
    PRODUCT ||--o{ LINEITEM : "appears in"
    PRODUCT {
        int id PK
        string name
        decimal price
    }
`;

const SAMPLES: Record<string, string> = {
  simple: SIMPLE_SAMPLE,
  ecommerce: ecommerceSample,
};

const ASPECT_PRESETS: Record<string, number | undefined> = {
  none: undefined,
  '16:9': 16 / 9,
  '4:3': 4 / 3,
  'A4-landscape': Math.SQRT2,
  square: 1,
};

const STORAGE_KEY_PREFIX = 'mermaid-er-positions:';

function loadPositions(sampleKey: string): NodePositions {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + sampleKey);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function savePositions(sampleKey: string, positions: NodePositions): void {
  try {
    localStorage.setItem(STORAGE_KEY_PREFIX + sampleKey, JSON.stringify(positions));
  } catch {
    /* ignore */
  }
}

function newJoinId(): string {
  return `j-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildSql(selected: ColumnRef[], joins: Join[]): string {
  if (selected.length === 0 && joins.length === 0) return '';

  const referencedTables = new Set<string>();
  selected.forEach((c) => referencedTables.add(c.table));
  joins.forEach((j) => {
    referencedTables.add(j.source.table);
    referencedTables.add(j.target.table);
  });
  if (referencedTables.size === 0) return '';

  const cols =
    selected.length > 0
      ? selected.map((c) => `  ${c.table}.${c.column}`).join(',\n')
      : '  *';

  const tableOrder: string[] = [];
  if (joins.length === 0) {
    tableOrder.push(...referencedTables);
  } else {
    const seen = new Set<string>();
    const first = joins[0].source.table;
    tableOrder.push(first);
    seen.add(first);
    for (const j of joins) {
      const next = seen.has(j.source.table) ? j.target.table : j.source.table;
      if (!seen.has(next)) {
        tableOrder.push(next);
        seen.add(next);
      }
    }
    for (const t of referencedTables) {
      if (!seen.has(t)) {
        tableOrder.push(t);
        seen.add(t);
      }
    }
  }

  let from = `FROM ${tableOrder[0]}`;
  for (const j of joins) {
    const joinedTable =
      tableOrder.includes(j.target.table) &&
      tableOrder.indexOf(j.target.table) > tableOrder.indexOf(j.source.table)
        ? j.target.table
        : j.source.table === tableOrder[0]
          ? j.target.table
          : j.source.table;
    from += `\n${j.type} JOIN ${joinedTable} ON ${j.source.table}.${j.source.column} = ${j.target.table}.${j.target.column}`;
  }

  return `SELECT\n${cols}\n${from};`;
}

function filterModel(model: ERModel, hidden: ReadonlySet<string>): ERModel {
  if (hidden.size === 0) return model;
  return {
    tables: model.tables.filter((t) => !hidden.has(t.name)),
    relations: model.relations.filter(
      (r) => !hidden.has(r.from) && !hidden.has(r.to),
    ),
    groups: model.groups
      .map((g) => ({ ...g, tables: g.tables.filter((t) => !hidden.has(t)) }))
      .filter((g) => g.tables.length > 0),
  };
}

export function App() {
  const [sampleKey, setSampleKey] = useState<keyof typeof SAMPLES>('ecommerce');
  const [source, setSource] = useState(SAMPLES.ecommerce);
  const [positions, setPositions] = useState<NodePositions>(() => loadPositions('ecommerce'));

  const [algorithm, setAlgorithm] = useState<LayoutAlgorithm>('layered');
  const [direction, setDirection] = useState<LayoutDirection>('DOWN');
  const [aspectKey, setAspectKey] = useState<keyof typeof ASPECT_PRESETS>('16:9');

  const [queryMode, setQueryMode] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState<ColumnRef[]>([]);
  const [joins, setJoins] = useState<Join[]>([]);
  const [pendingConnect, setPendingConnect] = useState<{
    source: PartialColumnRef;
    target: PartialColumnRef;
  } | null>(null);
  const [hiddenTables, setHiddenTables] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    savePositions(sampleKey, positions);
  }, [sampleKey, positions]);

  const switchSample = (key: keyof typeof SAMPLES) => {
    setSampleKey(key);
    setSource(SAMPLES[key]);
    setPositions(loadPositions(key));
    setSelectedColumns([]);
    setJoins([]);
    setPendingConnect(null);
    setHiddenTables(new Set());
  };

  const handlePositionsChange = useCallback((next: NodePositions) => {
    setPositions(next);
  }, []);

  const handleColumnSelectionChange = useCallback((next: ColumnRef[]) => {
    setSelectedColumns(next);
  }, []);

  const handleJoinConnect = useCallback(
    (s: PartialColumnRef, t: PartialColumnRef) => {
      setPendingConnect({ source: s, target: t });
    },
    [],
  );

  const handleJoinDelete = useCallback((joinId: string) => {
    setJoins((prev) => prev.filter((j) => j.id !== joinId));
  }, []);

  const handleTableRemove = useCallback((table: string) => {
    setHiddenTables((prev) => {
      const next = new Set(prev);
      next.add(table);
      return next;
    });
    // Drop joins / selections referencing the removed table
    setJoins((prev) =>
      prev.filter((j) => j.source.table !== table && j.target.table !== table),
    );
    setSelectedColumns((prev) => prev.filter((c) => c.table !== table));
  }, []);

  const restoreTables = () => setHiddenTables(new Set());

  const confirmJoin = (type: JoinType) => {
    if (!pendingConnect) return;
    const { source: s, target: t } = pendingConnect;
    if (!s.column || !t.column) {
      alert(
        'カラムを特定できませんでした (どちらかがテーブル中央にスナップしました)。\nカラム行へのドラッグでもう一度お試しください。',
      );
      setPendingConnect(null);
      return;
    }
    setJoins([
      ...joins,
      {
        id: newJoinId(),
        source: { table: s.table, column: s.column },
        target: { table: t.table, column: t.column },
        type,
      },
    ]);
    setPendingConnect(null);
  };

  const resetLayout = () => setPositions({});

  const exportPositions = () => {
    const json = JSON.stringify(positions, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mermaid-er-positions-${sampleKey}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importPositions = (file: File) => {
    file
      .text()
      .then((text) => {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === 'object') setPositions(parsed);
      })
      .catch(() => alert('Failed to parse positions JSON'));
  };

  const positionedCount = Object.keys(positions).length;
  const directionUsed = algorithm === 'layered' || algorithm === 'mrtree';

  const sql = useMemo(() => buildSql(selectedColumns, joins), [selectedColumns, joins]);

  // Parse externally so we can filter for hidden tables — demonstrates the `model` prop path.
  const baseModel = useMemo<ERModel | null>(() => {
    try {
      return parseMermaidER(source);
    } catch (e) {
      if (e instanceof MermaidERParseError) return null;
      throw e;
    }
  }, [source]);

  const visibleModel = useMemo(() => {
    if (!baseModel) return null;
    return filterModel(baseModel, hiddenTables);
  }, [baseModel, hiddenTables]);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '380px 1fr',
        gridTemplateRows: 'auto auto 1fr auto',
        height: '100%',
      }}
    >
      <div style={toolbarStyle}>
        <strong>mermaid-er demo</strong>
        <Sep />
        <Lbl>Sample</Lbl>
        <Btn active={sampleKey === 'simple'} onClick={() => switchSample('simple')}>
          Simple
        </Btn>
        <Btn active={sampleKey === 'ecommerce'} onClick={() => switchSample('ecommerce')}>
          E-commerce (18 tables)
        </Btn>
        <Sep />
        <Lbl>Mode</Lbl>
        <Btn active={!queryMode} onClick={() => setQueryMode(false)}>
          View
        </Btn>
        <Btn active={queryMode} onClick={() => setQueryMode(true)}>
          Query Builder
        </Btn>
        {queryMode && (
          <>
            <span style={{ color: '#374151' }}>
              Cols: <strong>{selectedColumns.length}</strong>
            </span>
            <span style={{ color: '#374151' }}>
              Joins: <strong>{joins.length}</strong>
            </span>
            <Btn
              onClick={() => {
                setSelectedColumns([]);
                setJoins([]);
              }}
              disabled={selectedColumns.length === 0 && joins.length === 0}
            >
              Clear
            </Btn>
          </>
        )}
        {hiddenTables.size > 0 && (
          <>
            <Sep />
            <span style={{ color: '#374151' }}>
              Hidden: <strong>{hiddenTables.size}</strong>
            </span>
            <Btn onClick={restoreTables}>Restore all</Btn>
          </>
        )}
        <span style={{ marginLeft: 'auto', color: '#9ca3af', fontSize: 11 }}>
          Drag tables · <strong>Shift+drag</strong> for box select ·{' '}
          {queryMode
            ? 'col→col to JOIN · × on header to remove · × on JOIN label to delete'
            : 'Hover edges to highlight FK refs'}
        </span>
      </div>

      <div style={{ ...toolbarStyle, gridColumn: '1 / 3', borderTop: 0 }}>
        <Lbl>Positioned</Lbl>
        <strong>{positionedCount}</strong>
        <Btn onClick={resetLayout} disabled={positionedCount === 0}>
          Reset
        </Btn>
        <Btn onClick={exportPositions} disabled={positionedCount === 0}>
          Export JSON
        </Btn>
        <FileBtn onFile={importPositions}>Import JSON</FileBtn>
        <Sep />
        <Lbl>Algorithm</Lbl>
        <Select<LayoutAlgorithm>
          value={algorithm}
          onChange={setAlgorithm}
          options={[
            { value: 'layered', label: 'layered' },
            { value: 'stress', label: 'stress' },
            { value: 'force', label: 'force' },
            { value: 'mrtree', label: 'mrtree' },
            { value: 'rectpacking', label: 'rectpacking' },
          ]}
        />
        <Lbl>Direction</Lbl>
        <Select<LayoutDirection>
          value={direction}
          onChange={setDirection}
          disabled={!directionUsed}
          options={[
            { value: 'DOWN', label: 'DOWN' },
            { value: 'RIGHT', label: 'RIGHT' },
            { value: 'LEFT', label: 'LEFT' },
            { value: 'UP', label: 'UP' },
          ]}
        />
        <Lbl>Aspect</Lbl>
        <Select<keyof typeof ASPECT_PRESETS>
          value={aspectKey}
          onChange={setAspectKey}
          options={[
            { value: 'none', label: 'none' },
            { value: '16:9', label: '16:9' },
            { value: '4:3', label: '4:3' },
            { value: 'A4-landscape', label: 'A4-landscape' },
            { value: 'square', label: 'square' },
          ]}
        />
      </div>

      <textarea
        value={source}
        onChange={(e) => setSource(e.target.value)}
        spellCheck={false}
        style={{
          height: '100%',
          width: '100%',
          boxSizing: 'border-box',
          padding: 12,
          fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
          fontSize: 12,
          lineHeight: 1.4,
          border: 'none',
          borderRight: '1px solid #d1d5db',
          resize: 'none',
          outline: 'none',
        }}
      />
      <div style={{ height: '100%', overflow: 'hidden' }}>
        <MermaidER
          model={visibleModel ?? undefined}
          source={visibleModel ? undefined : source}
          positions={positions}
          onPositionsChange={handlePositionsChange}
          algorithm={algorithm}
          direction={direction}
          aspectRatio={ASPECT_PRESETS[aspectKey]}
          showColumnCheckboxes={queryMode}
          selectedColumns={selectedColumns}
          onColumnSelectionChange={handleColumnSelectionChange}
          enableManualJoins={queryMode}
          joins={joins}
          onJoinConnect={handleJoinConnect}
          onJoinDelete={handleJoinDelete}
          onTableRemove={queryMode ? handleTableRemove : undefined}
          style={{ height: '100%' }}
        />
      </div>

      {queryMode && sql && (
        <pre
          style={{
            gridColumn: '1 / 3',
            margin: 0,
            padding: '10px 14px',
            background: '#0f172a',
            color: '#e2e8f0',
            fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
            fontSize: 12,
            lineHeight: 1.5,
            borderTop: '1px solid #1e293b',
            maxHeight: 200,
            overflow: 'auto',
          }}
        >
          {sql}
        </pre>
      )}

      {pendingConnect && (
        <JoinDialog
          source={pendingConnect.source}
          target={pendingConnect.target}
          onConfirm={confirmJoin}
          onCancel={() => setPendingConnect(null)}
        />
      )}
    </div>
  );
}

function JoinDialog({
  source,
  target,
  onConfirm,
  onCancel,
}: {
  source: PartialColumnRef;
  target: PartialColumnRef;
  onConfirm: (type: JoinType) => void;
  onCancel: () => void;
}) {
  const types: JoinType[] = ['INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS'];
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          padding: 20,
          borderRadius: 8,
          minWidth: 380,
          boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Add JOIN</div>
        <div
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
            fontSize: 12,
            background: '#f3f4f6',
            padding: '8px 10px',
            borderRadius: 4,
            marginBottom: 12,
          }}
        >
          {source.table}.{source.column ?? '<unspecified>'}
          {'  ⇄  '}
          {target.table}.{target.column ?? '<unspecified>'}
        </div>
        {(!source.column || !target.column) && (
          <div style={{ fontSize: 11, color: '#b45309', marginBottom: 8 }}>
            ⚠ どちらかのカラムが特定できていません。Cancelしてカラム行同士で再接続してください。
          </div>
        )}
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>JOIN type</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {types.map((t) => (
            <button
              key={t}
              onClick={() => onConfirm(t)}
              style={{
                padding: '6px 12px',
                borderRadius: 4,
                border: '1px solid #d1d5db',
                background: '#fff',
                color: '#1f2937',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
              }}
            >
              {t}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '6px 14px',
              borderRadius: 4,
              border: '1px solid #d1d5db',
              background: '#fff',
              color: '#374151',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

const toolbarStyle: React.CSSProperties = {
  gridColumn: '1 / 3',
  padding: '8px 12px',
  background: '#f3f4f6',
  borderBottom: '1px solid #d1d5db',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 13,
  flexWrap: 'wrap',
};

function Sep() {
  return <span style={{ color: '#9ca3af' }}>|</span>;
}

function Lbl({ children }: { children: React.ReactNode }) {
  return <span style={{ color: '#374151' }}>{children}:</span>;
}

function Btn({
  children,
  onClick,
  active,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '4px 10px',
        borderRadius: 4,
        border: '1px solid #d1d5db',
        background: active ? '#1e40af' : '#fff',
        color: disabled ? '#9ca3af' : active ? '#fff' : '#374151',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 12,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}

function FileBtn({
  children,
  onFile,
}: {
  children: React.ReactNode;
  onFile: (file: File) => void;
}) {
  return (
    <label
      style={{
        padding: '4px 10px',
        borderRadius: 4,
        border: '1px solid #d1d5db',
        background: '#fff',
        color: '#374151',
        cursor: 'pointer',
        fontSize: 12,
      }}
    >
      {children}
      <input
        type="file"
        accept="application/json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
    </label>
  );
}

function Select<T extends string>({
  value,
  onChange,
  options,
  disabled,
}: {
  value: T;
  onChange: (v: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      disabled={disabled}
      style={{
        padding: '4px 8px',
        borderRadius: 4,
        border: '1px solid #d1d5db',
        background: '#fff',
        color: disabled ? '#9ca3af' : '#374151',
        fontSize: 12,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
