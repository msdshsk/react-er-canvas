import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { layoutER, parseMermaidER } from '../src/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sampleSchema = readFileSync(
  resolve(__dirname, 'fixtures/laravel-schema.mmd'),
  'utf8',
);

describe('integration — synthetic e-commerce schema (18 tables, 22 relations)', () => {
  const model = parseMermaidER(sampleSchema);

  it('parses the expected number of tables and relations', () => {
    expect(model.tables).toHaveLength(18);
    expect(model.relations).toHaveLength(22);
  });

  it('every relation resolves to specific source and target columns', () => {
    const unresolved = model.relations.filter(
      (r) => !r.fromColumn || !r.toColumn,
    );
    expect(unresolved).toEqual([]);
  });

  it('identifies junction tables via PK,FK columns on multiple cols', () => {
    const junctions = model.tables.filter((t) => {
      const pkfk = t.columns.filter((c) => c.keys.pk && c.keys.fk);
      return pkfk.length >= 2;
    });
    const names = junctions.map((t) => t.name).sort();
    expect(names).toEqual([
      'blog_post_tags',
      'order_coupons',
      'product_categories',
      'product_media',
    ]);
  });

  it('correctly resolves multiple FKs from the same parent table', () => {
    // customer_addresses has two relations into orders (billing, shipping) —
    // both should be distinguished via the Laravel-style label.
    const addressToOrders = model.relations.filter(
      (r) => r.from === 'customer_addresses' && r.to === 'orders',
    );
    const cols = addressToOrders.map((r) => r.toColumn).sort();
    expect(cols).toEqual(['billing_address_id', 'shipping_address_id']);

    // authors has two relations into comments (author, reply_to_author).
    const authorsToComments = model.relations.filter(
      (r) => r.from === 'authors' && r.to === 'comments',
    );
    const authorCols = authorsToComments.map((r) => r.toColumn).sort();
    expect(authorCols).toEqual(['author_id', 'reply_to_author_id']);
  });

  it('correctly resolves self-referencing relations', () => {
    const selfRefs = model.relations.filter((r) => r.from === r.to);
    expect(selfRefs.length).toBeGreaterThanOrEqual(2);
    for (const r of selfRefs) {
      expect(r.fromColumn).toBe('id');
      // target column must be the FK referencing self, not 'id'
      expect(r.toColumn).toBeDefined();
      expect(r.toColumn).not.toBe('id');
    }
    const selfRefSources = selfRefs.map((r) => r.from).sort();
    expect(selfRefSources).toContain('categories');
    expect(selfRefSources).toContain('comments');
  });

  it('preserves group memberships for tables inside %% @group blocks', () => {
    const tableByName = Object.fromEntries(model.tables.map((t) => [t.name, t]));
    expect(tableByName.brands.group).toBe('catalog');
    expect(tableByName.orders.group).toBe('sales');
    expect(tableByName.comments.group).toBe('content');
    // `media` is declared outside any group block
    expect(tableByName.media.group).toBeUndefined();

    expect(model.groups.map((g) => g.name)).toEqual(['catalog', 'sales', 'content']);
  });

  it('layouts the full schema with elkjs in a reasonable canvas', async () => {
    const layout = await layoutER(model);
    expect(layout.nodes).toHaveLength(18);
    expect(layout.edges).toHaveLength(22);
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
    // Sanity: with 18 tables the canvas should be at least 800px in some axis
    expect(Math.max(layout.width, layout.height)).toBeGreaterThan(800);
  });

  it('respects the aspectRatio hint when provided', async () => {
    const tall = await layoutER(model, { aspectRatio: 0.5 });
    const wide = await layoutER(model, { aspectRatio: 4 });
    const tallRatio = tall.width / tall.height;
    const wideRatio = wide.width / wide.height;
    expect(wideRatio).toBeGreaterThan(tallRatio);
  });
});
