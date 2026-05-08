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
}
