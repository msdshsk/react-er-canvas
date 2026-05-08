import { describe, expect, it } from 'vitest';
import { MermaidERParseError, parseMermaidER } from './index';

describe('parseMermaidER — basic structure', () => {
  it('parses an empty erDiagram into an empty model', () => {
    const m = parseMermaidER('erDiagram');
    expect(m.tables).toEqual([]);
    expect(m.relations).toEqual([]);
    expect(m.groups).toEqual([]);
  });

  it('rejects input missing the erDiagram keyword', () => {
    expect(() => parseMermaidER('CUSTOMER { int id PK }')).toThrow(MermaidERParseError);
  });
});

describe('parseMermaidER — entities', () => {
  it('parses a simple entity with type, name, and PK', () => {
    const m = parseMermaidER(`
      erDiagram
        CUSTOMER {
          int id PK
          string name
        }
    `);
    expect(m.tables).toHaveLength(1);
    const t = m.tables[0];
    expect(t.name).toBe('CUSTOMER');
    expect(t.columns).toEqual([
      { type: 'int', name: 'id', keys: { pk: true }, comment: undefined },
      { type: 'string', name: 'name', keys: {}, comment: undefined },
    ]);
  });

  it('captures column comments', () => {
    const m = parseMermaidER(`
      erDiagram
        T {
          int id PK "primary key"
          string name "user-visible name"
        }
    `);
    expect(m.tables[0].columns.map((c) => c.comment)).toEqual([
      'primary key',
      'user-visible name',
    ]);
  });

  it('handles flattened type names (bigint_unsigned, varchar255, enum_a_b_c)', () => {
    const m = parseMermaidER(`
      erDiagram
        T {
          bigint_unsigned id PK
          varchar255 name
          enumdraft_published_archived status
        }
    `);
    expect(m.tables[0].columns.map((c) => c.type)).toEqual([
      'bigint_unsigned',
      'varchar255',
      'enumdraft_published_archived',
    ]);
  });

  it('supports parenthesized types like varchar(255)', () => {
    const m = parseMermaidER(`
      erDiagram
        T {
          varchar(255) name
          decimal(10,2) amount
        }
    `);
    expect(m.tables[0].columns.map((c) => c.type)).toEqual([
      'varchar(255)',
      'decimal(10,2)',
    ]);
  });

  it('accepts comma-separated keys (PK,FK)', () => {
    const m = parseMermaidER(`
      erDiagram
        event_taxonomy {
          bigint event_id PK,FK
          bigint taxonomy_id PK,FK
          timestamp created_at
        }
    `);
    const cols = m.tables[0].columns;
    expect(cols[0].keys).toEqual({ pk: true, fk: true });
    expect(cols[1].keys).toEqual({ pk: true, fk: true });
    expect(cols[2].keys).toEqual({});
  });

  it('accepts space-separated keys (PK FK)', () => {
    const m = parseMermaidER(`
      erDiagram
        T {
          bigint id PK FK
        }
    `);
    expect(m.tables[0].columns[0].keys).toEqual({ pk: true, fk: true });
  });
});

describe('parseMermaidER — relations', () => {
  it('parses all four left/right cardinality combinations', () => {
    const m = parseMermaidER(`
      erDiagram
        A ||--|| B : "one to one"
        C |o--o| D : "zero or one to zero or one"
        E }|--|{ F : "one or many"
        G }o--o{ H : "zero or many"
    `);
    expect(m.relations.map((r) => [r.fromCardinality, r.toCardinality])).toEqual([
      ['one', 'one'],
      ['one-or-zero', 'one-or-zero'],
      ['one-or-many', 'one-or-many'],
      ['zero-or-many', 'zero-or-many'],
    ]);
  });

  it('distinguishes identifying (--) from non-identifying (..)', () => {
    const m = parseMermaidER(`
      erDiagram
        A ||--o{ B : ident
        C ||..o{ D : non
    `);
    expect(m.relations[0].identifying).toBe(true);
    expect(m.relations[1].identifying).toBe(false);
  });

  it('captures both quoted and unquoted relation labels', () => {
    const m = parseMermaidER(`
      erDiagram
        A ||--o{ B : places
        C ||--o{ D : "has many"
    `);
    expect(m.relations[0].label).toBe('places');
    expect(m.relations[1].label).toBe('has many');
  });

  it('forward-declares entities seen only in relations', () => {
    const m = parseMermaidER(`
      erDiagram
        A ||--o{ B : x
        A {
          int id PK
        }
    `);
    expect(m.tables.map((t) => t.name).sort()).toEqual(['A', 'B']);
    const a = m.tables.find((t) => t.name === 'A')!;
    const b = m.tables.find((t) => t.name === 'B')!;
    expect(a.columns).toHaveLength(1);
    expect(b.columns).toHaveLength(0);
  });

  it('supports self-referencing relations', () => {
    const m = parseMermaidER(`
      erDiagram
        comments ||--o{ comments : "comments_parent_id_foreign"
        comments {
          int id PK
          int parent_id FK
        }
    `);
    expect(m.relations).toHaveLength(1);
    expect(m.relations[0].from).toBe('comments');
    expect(m.relations[0].to).toBe('comments');
  });
});

describe('parseMermaidER — comments and directives', () => {
  it('skips ordinary %% comments', () => {
    const m = parseMermaidER(`
      erDiagram
        %% this is just a comment
        T {
          int id PK
        }
        %% another comment
    `);
    expect(m.tables).toHaveLength(1);
  });

  it('groups tables enclosed by %% @group / %% @endgroup', () => {
    const m = parseMermaidER(`
      erDiagram
        %% @group public
        A {
          int id PK
        }
        B {
          int id PK
        }
        %% @endgroup
        %% @group analytics
        C {
          int id PK
        }
        %% @endgroup
        D {
          int id PK
        }
    `);
    const tableByName = Object.fromEntries(m.tables.map((t) => [t.name, t]));
    expect(tableByName.A.group).toBe('public');
    expect(tableByName.B.group).toBe('public');
    expect(tableByName.C.group).toBe('analytics');
    expect(tableByName.D.group).toBeUndefined();
    expect(m.groups.map((g) => g.name)).toEqual(['public', 'analytics']);
    expect(m.groups[0].tables).toEqual(['A', 'B']);
    expect(m.groups[1].tables).toEqual(['C']);
  });

  it('applies %% @ref to override the most recent relation', () => {
    const m = parseMermaidER(`
      erDiagram
        A ||--o{ B : "x"
        %% @ref A.id -> B.parent_a_id
        A {
          int id PK
        }
        B {
          int id PK
          int parent_a_id FK
          int other_a_id FK
        }
    `);
    expect(m.relations[0].fromColumn).toBe('id');
    expect(m.relations[0].toColumn).toBe('parent_a_id');
  });

  it('applies %% @ref with reversed table order', () => {
    const m = parseMermaidER(`
      erDiagram
        A ||--o{ B : "x"
        %% @ref B.parent_a_id -> A.id
        A {
          int id PK
        }
        B {
          int id PK
          int parent_a_id FK
        }
    `);
    expect(m.relations[0].fromColumn).toBe('id');
    expect(m.relations[0].toColumn).toBe('parent_a_id');
  });
});

describe('parseMermaidER — error reporting', () => {
  it('throws MermaidERParseError on malformed input with line/column info', () => {
    let err: MermaidERParseError | undefined;
    try {
      parseMermaidER(`
        erDiagram
          T {
            int id ???
          }
      `);
    } catch (e) {
      err = e as MermaidERParseError;
    }
    expect(err).toBeInstanceOf(MermaidERParseError);
    expect(err!.errors.length).toBeGreaterThan(0);
    expect(typeof err!.errors[0].line).toBe('number');
    expect(err!.errors[0].line).toBeGreaterThanOrEqual(1);
  });

  it('takes the lex-error path (not parse-error path) on illegal characters', () => {
    let err: MermaidERParseError | undefined;
    try {
      parseMermaidER('erDiagram\n  $not_a_token');
    } catch (e) {
      err = e as MermaidERParseError;
    }
    expect(err).toBeInstanceOf(MermaidERParseError);
    expect(err!.message).toMatch(/Lex error/);
    expect(err!.errors[0].line).toBeGreaterThanOrEqual(2);
  });
});

describe('parseMermaidER — state isolation across consecutive calls', () => {
  // The grammar is a module-level singleton. After a failed parse, chevrotain's
  // internal state (errors, RULE_STACK, lookahead caches) MUST be cleared by
  // resetState() / super.reset() before the next call. This regression test
  // catches future code that overrides reset() without delegating.
  it('produces identical output when the same source is parsed twice in a row', () => {
    const source = `
      erDiagram
        A ||--o{ B : x
        A { int id PK }
        B { int id PK; int a_id FK }
    `.replace(/;/g, '\n        ');
    const m1 = parseMermaidER(source);
    const m2 = parseMermaidER(source);
    expect(m2).toEqual(m1);
  });

  it('recovers fully after a parse failure (no leaked state)', () => {
    const valid = `
      erDiagram
        A ||--o{ B : x
        A { int id PK }
        B { int id PK }
    `;
    const m1 = parseMermaidER(valid);

    expect(() => parseMermaidER('this is not a mermaid diagram')).toThrow(
      MermaidERParseError,
    );
    expect(() => parseMermaidER('erDiagram\n  $$$bogus')).toThrow(
      MermaidERParseError,
    );

    const m2 = parseMermaidER(valid);
    expect(m2).toEqual(m1);
  });
});
