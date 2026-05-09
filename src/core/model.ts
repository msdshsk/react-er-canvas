export type Cardinality =
  | 'one'
  | 'one-or-zero'
  | 'one-or-many'
  | 'zero-or-many';

export interface ColumnKey {
  pk?: boolean;
  fk?: boolean;
  uk?: boolean;
}

export interface Column {
  name: string;
  type?: string;
  comment?: string;
  keys: ColumnKey;
}

export interface Table {
  name: string;
  columns: Column[];
  group?: string;
  /**
   * Opaque consumer-defined data. The library never reads this — it is only
   * passed back through callbacks (e.g. `onTableRemove(name, meta)`) so the
   * consumer can map a table back to its own domain entity (kind: 'view',
   * pseudo-id, alias info, etc.) without a name-based scan.
   */
  meta?: unknown;
}

export interface Relation {
  id: string;
  from: string;
  to: string;
  fromCardinality: Cardinality;
  toCardinality: Cardinality;
  identifying: boolean;
  label?: string;
  /** Column name on the `from` table that participates in this relation. */
  fromColumn?: string;
  /** Column name on the `to` table that participates in this relation. */
  toColumn?: string;
}

export interface Group {
  name: string;
  tables: string[];
}

export interface ERModel {
  tables: Table[];
  relations: Relation[];
  groups: Group[];
}

export interface ColumnRef {
  table: string;
  column: string;
}

export interface PartialColumnRef {
  table: string;
  column?: string;
}

export type JoinType = 'INNER' | 'LEFT' | 'RIGHT' | 'FULL' | 'CROSS';

export interface Join {
  id: string;
  source: ColumnRef;
  target: ColumnRef;
  type: JoinType;
  /**
   * Opaque consumer-defined data. Same role as `Table.meta` — passed back
   * through `onJoinClick` / `onJoinDelete` so consumer can carry origin info
   * (e.g. 'auto' vs 'manual'), styling hints, etc.
   */
  meta?: unknown;
}
