import { describe, expect, it } from 'vitest';
import { parseMermaidER } from './index';

/**
 * resolveColumnRefs is invoked internally by parseMermaidER. We test it via
 * the public surface — checking the .fromColumn / .toColumn fields populated
 * on each resolved Relation.
 */
describe('column resolution — single FK candidate', () => {
  it('auto-resolves when only one FK column exists on the FK side', () => {
    const m = parseMermaidER(`
      erDiagram
        users ||--o{ blogs : x
        users {
          bigint id PK
        }
        blogs {
          bigint id PK
          bigint user_id FK
          text content
        }
    `);
    const r = m.relations[0];
    expect(r.from).toBe('users');
    expect(r.to).toBe('blogs');
    expect(r.fromColumn).toBe('id');
    expect(r.toColumn).toBe('user_id');
  });

  it('handles reversed cardinality direction (FK side is `from`)', () => {
    const m = parseMermaidER(`
      erDiagram
        blogs }o--|| users : x
        blogs {
          bigint id PK
          bigint user_id FK
        }
        users {
          bigint id PK
        }
    `);
    const r = m.relations[0];
    // from = blogs (FK side), to = users (PK side)
    expect(r.fromColumn).toBe('user_id');
    expect(r.toColumn).toBe('id');
  });
});

describe('column resolution — multiple FKs disambiguated by Laravel constraint label', () => {
  it('uses <fkTable>_<col>_foreign label pattern', () => {
    const m = parseMermaidER(`
      erDiagram
        users ||--o{ comments : "comments_replied_user_id_foreign"
        users {
          bigint id PK
        }
        comments {
          bigint id PK
          bigint user_id FK
          bigint replied_user_id FK
          bigint parent_id FK
        }
    `);
    expect(m.relations[0].toColumn).toBe('replied_user_id');
    expect(m.relations[0].fromColumn).toBe('id');
  });

  it('disambiguates three concurrent users→comments relations', () => {
    const m = parseMermaidER(`
      erDiagram
        users ||--o{ comments : "comments_user_id_foreign"
        users ||--o{ comments : "comments_replied_user_id_foreign"
        comments ||--o{ comments : "comments_parent_id_foreign"
        users {
          bigint id PK
        }
        comments {
          bigint id PK
          bigint user_id FK
          bigint replied_user_id FK
          bigint parent_id FK
        }
    `);
    const cols = m.relations.map((r) => r.toColumn);
    expect(cols).toEqual(['user_id', 'replied_user_id', 'parent_id']);
  });

  it('falls back to <fkTable>_<col> if _foreign suffix is absent', () => {
    const m = parseMermaidER(`
      erDiagram
        users ||--o{ comments : "comments_replied_user_id"
        users {
          bigint id PK
        }
        comments {
          bigint id PK
          bigint user_id FK
          bigint replied_user_id FK
        }
    `);
    expect(m.relations[0].toColumn).toBe('replied_user_id');
  });
});

describe('column resolution — naming convention fallback', () => {
  it('uses <pkTable>_id pattern when label gives no hint', () => {
    const m = parseMermaidER(`
      erDiagram
        users ||--o{ comments : x
        users {
          bigint id PK
        }
        comments {
          bigint id PK
          bigint user_id FK
          bigint other_id FK
        }
    `);
    // user_id matches the <users>_id pattern
    expect(m.relations[0].toColumn).toBe('user_id');
  });
});

describe('column resolution — junction tables (PK,FK)', () => {
  it('handles tables where columns are both PK and FK', () => {
    const m = parseMermaidER(`
      erDiagram
        events ||--o{ event_taxonomy : "event_taxonomy_event_id_foreign"
        taxonomies ||--o{ event_taxonomy : "event_taxonomy_taxonomy_id_foreign"
        events {
          bigint id PK
        }
        taxonomies {
          bigint id PK
        }
        event_taxonomy {
          bigint event_id PK,FK
          bigint taxonomy_id PK,FK
        }
    `);
    expect(m.relations[0].fromColumn).toBe('id');
    expect(m.relations[0].toColumn).toBe('event_id');
    expect(m.relations[1].fromColumn).toBe('id');
    expect(m.relations[1].toColumn).toBe('taxonomy_id');
  });
});

describe('column resolution — self-references', () => {
  it('resolves self-referencing relations via Laravel label', () => {
    const m = parseMermaidER(`
      erDiagram
        comments ||--o{ comments : "comments_parent_id_foreign"
        comments {
          bigint id PK
          bigint parent_id FK
        }
    `);
    expect(m.relations[0].fromColumn).toBe('id');
    expect(m.relations[0].toColumn).toBe('parent_id');
  });
});

describe('column resolution — explicit %% @ref overrides', () => {
  it('@ref wins over inference even when label suggests another column', () => {
    const m = parseMermaidER(`
      erDiagram
        users ||--o{ comments : "comments_user_id_foreign"
        %% @ref users.id -> comments.replied_user_id
        users {
          bigint id PK
        }
        comments {
          bigint id PK
          bigint user_id FK
          bigint replied_user_id FK
        }
    `);
    expect(m.relations[0].toColumn).toBe('replied_user_id');
  });
});
