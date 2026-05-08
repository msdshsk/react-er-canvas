# @msdshsk/react-er-canvas

[日本語 README](./README.ja.md)

Render Mermaid-format ER diagrams in React / Electron, with extended visual features that the stock Mermaid renderer lacks:

- **Column-level FK connections** (lines from `users.id` to `orders.user_id`, not just table-to-table)
- **Drag-to-position** with optional persistence via `positions` / `onPositionsChange`
- **Hover-driven FK reference highlighting**
- **PK / FK / UK / type / comment** rendered per column
- **Schema groups** (via `%% @group` directive that stays Mermaid-compatible)
- **Manual JOIN authoring** (column-to-column drag) for query builder UIs
- **Column selection** (checkboxes) for query builder UIs

Built on [`@xyflow/react`](https://reactflow.dev/), [`elkjs`](https://github.com/kieler/elkjs), and a handwritten [`chevrotain`](https://chevrotain.io/) parser.

## Install

```sh
npm install @msdshsk/react-er-canvas @xyflow/react react react-dom
```

`@xyflow/react`, `react`, and `react-dom` are peer dependencies — make sure they're installed in your app.

You also need to import React Flow's stylesheet **once** in your app:

```ts
import '@xyflow/react/dist/style.css';
```

## Usage — Mermaid source

```tsx
import { MermaidER } from '@msdshsk/react-er-canvas';

const source = `
erDiagram
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
    }
`;

export function Schema() {
  return <div style={{ height: '100vh' }}><MermaidER source={source} /></div>;
}
```

## Usage — pre-built model (skips parsing)

If your app already has structured schema data (e.g., from `INFORMATION_SCHEMA`), pass it directly via `model`:

```tsx
import { MermaidER, type ERModel } from '@msdshsk/react-er-canvas';

const model: ERModel = {
  tables: [
    {
      name: 'users',
      columns: [
        { name: 'id', type: 'bigint', keys: { pk: true } },
        { name: 'email', type: 'varchar(255)', keys: { uk: true } },
      ],
    },
    {
      name: 'orders',
      columns: [
        { name: 'id', type: 'bigint', keys: { pk: true } },
        { name: 'user_id', type: 'bigint', keys: { fk: true } },
      ],
    },
  ],
  relations: [
    {
      id: 'users-orders',
      from: 'users',
      to: 'orders',
      fromCardinality: 'one',
      toCardinality: 'zero-or-many',
      identifying: true,
      fromColumn: 'id',
      toColumn: 'user_id',
    },
  ],
  groups: [],
};

<MermaidER model={model} />;
```

`source` and `model` are mutually exclusive; if both are passed, `model` wins.

## Usage — Query Builder mode

Combine column checkboxes and manual JOINs to build a visual query composer:

```tsx
import { useState } from 'react';
import {
  MermaidER,
  type ColumnRef,
  type Join,
  type PartialColumnRef,
} from '@msdshsk/react-er-canvas';

function QueryBuilder({ source }: { source: string }) {
  const [selected, setSelected] = useState<ColumnRef[]>([]);
  const [joins, setJoins] = useState<Join[]>([]);

  return (
    <MermaidER
      source={source}
      showColumnCheckboxes
      selectedColumns={selected}
      onColumnSelectionChange={setSelected}
      enableManualJoins
      joins={joins}
      onJoinConnect={(s, t) => {
        // open a dialog to ask for JOIN type, then:
        // setJoins([...joins, { id: ..., source: s as ColumnRef, target: t as ColumnRef, type: 'INNER' }]);
      }}
      onJoinDelete={(id) => setJoins(joins.filter((j) => j.id !== id))}
    />
  );
}
```

See `examples/web/` in the repo for a full demo (sample switcher, SQL generation, position persistence, layout algorithm controls, table removal).

## Mermaid-compatible extensions

These directives are written as comments so they survive a round-trip through stock Mermaid renderers:

```mermaid
%% @group public
CUSTOMER { int id PK }
ORDER    { int id PK }
%% @endgroup

%% @ref CUSTOMER.id -> ORDER.customer_id
```

- **`%% @group <name>`** ... **`%% @endgroup`** — visually mark tables as belonging to a schema/namespace; they get a colored header badge.
- **`%% @ref <Table>.<col> -> <Table>.<col>`** — explicit FK column override, applied to the most recent relation. Use this when automatic inference can't disambiguate (e.g., multiple FKs from `users` to `comments`).

## Automatic FK column inference

When the relation `A ||--o{ B` is declared, the library tries to determine which column on `A` (PK side) connects to which column on `B` (FK side), in this priority:

1. **`%% @ref` directive** (always wins)
2. **Laravel-style label** — if the relation label matches `<fkTable>_<col>_foreign`, that pinpoints the FK column
3. **Loose label match** — `<fkTable>_<col>`
4. **Naming conventions** — `<pkTable>_<pkCol>` or `<pkTable>_id` on the FK side
5. **Single-FK fallback** — if only one FK column exists on the FK table, use it
6. **First-FK fallback** — last resort

## Layout

Powered by [elkjs](https://github.com/kieler/elkjs). Configurable via:

```tsx
<MermaidER
  algorithm="layered"     // 'layered' | 'stress' | 'force' | 'mrtree' | 'rectpacking' | 'radial'
  direction="DOWN"        // 'DOWN' | 'RIGHT' | 'LEFT' | 'UP' (only used by layered/mrtree)
  aspectRatio={16/9}      // hint to wrap layers to fit a target aspect
/>
```

Defaults to `layered` + `DOWN`.

For interactive editing, **debounce parse on the consumer side** if your source updates on every keystroke — the library re-parses synchronously on each `source` change.

## Position persistence

```tsx
const [positions, setPositions] = useState<NodePositions>(loadFromStorage());

<MermaidER
  source={source}
  positions={positions}
  onPositionsChange={(next) => {
    setPositions(next);
    saveToStorage(next);
  }}
/>
```

Tables not present in `positions` use the auto-layout result. Multi-select drag (Shift+drag for box select, then drag) is preserved.

## Public API

```ts
import {
  MermaidER,
  parseMermaidER,
  layoutER,
  MermaidERParseError,
} from '@msdshsk/react-er-canvas';
```

The full type surface is exported from the package root: `MermaidERProps`, `ERModel`, `Table`, `Column`, `Relation`, `Group`, `ColumnRef`, `PartialColumnRef`, `Join`, `JoinType`, `LayoutOptions`, `LayoutAlgorithm`, `LayoutDirection`, `NodePositions`, `NodePosition`, `LayoutResult`, `PositionedNode`, `PositionedEdge`, `EdgePoint`, `Cardinality`, `ColumnKey`.

A headless subpath `@msdshsk/react-er-canvas/core` is also available for environments without React (just parsing + layout, no rendering).

## License

MIT — see [LICENSE](./LICENSE).

For third-party dependency licenses (Apache-2.0 / EPL-2.0 / MIT) and attribution, see [NOTICE](./NOTICE.md).
