import type { Cardinality, Column, ERModel, Relation, Table } from '../model';
import { erLexer } from './lexer';
import { erGrammar } from './grammar';

export class MermaidERParseError extends Error {
  constructor(
    message: string,
    public readonly errors: ReadonlyArray<{ message: string; line?: number; column?: number }>,
  ) {
    super(message);
    this.name = 'MermaidERParseError';
  }
}

export function parseMermaidER(source: string): ERModel {
  const lexed = erLexer.tokenize(source);
  if (lexed.errors.length > 0) {
    const first = lexed.errors[0];
    throw new MermaidERParseError(
      `Lex error at line ${first.line}:${first.column}: ${first.message}`,
      lexed.errors.map((e) => ({
        message: e.message,
        line: e.line ?? undefined,
        column: e.column ?? undefined,
      })),
    );
  }

  erGrammar.resetState();
  erGrammar.input = lexed.tokens;
  erGrammar.diagram();

  if (erGrammar.errors.length > 0) {
    const first = erGrammar.errors[0];
    throw new MermaidERParseError(
      `Parse error at line ${first.token.startLine}:${first.token.startColumn}: ${first.message}`,
      erGrammar.errors.map((e) => ({
        message: e.message,
        line: e.token.startLine,
        column: e.token.startColumn,
      })),
    );
  }

  const model = erGrammar.buildModel();
  return resolveColumnRefs(model);
}

const PK_CARDINALITIES: ReadonlySet<Cardinality> = new Set(['one', 'one-or-zero']);

function resolveColumnRefs(model: ERModel): ERModel {
  const tableMap = new Map(model.tables.map((t) => [t.name, t]));

  for (const rel of model.relations) {
    if (rel.fromColumn && rel.toColumn) continue;

    const fromTable = tableMap.get(rel.from);
    const toTable = tableMap.get(rel.to);
    if (!fromTable || !toTable) continue;

    const fromIsPkSide = PK_CARDINALITIES.has(rel.fromCardinality);
    const toIsPkSide = PK_CARDINALITIES.has(rel.toCardinality);

    let pkTable: Table;
    let fkTable: Table;
    let pkOnFromSide: boolean;

    if (fromIsPkSide && !toIsPkSide) {
      pkTable = fromTable;
      fkTable = toTable;
      pkOnFromSide = true;
    } else if (toIsPkSide && !fromIsPkSide) {
      pkTable = toTable;
      fkTable = fromTable;
      pkOnFromSide = false;
    } else {
      pkTable = fromTable;
      fkTable = toTable;
      pkOnFromSide = true;
    }

    const pkCol = pkTable.columns.find((c) => c.keys.pk);
    const fkCol = inferFkColumn(rel, fkTable, pkTable, pkCol?.name);

    if (!pkCol || !fkCol) continue;

    if (pkOnFromSide) {
      if (!rel.fromColumn) rel.fromColumn = pkCol.name;
      if (!rel.toColumn) rel.toColumn = fkCol.name;
    } else {
      if (!rel.fromColumn) rel.fromColumn = fkCol.name;
      if (!rel.toColumn) rel.toColumn = pkCol.name;
    }
  }

  return model;
}

function inferFkColumn(
  rel: Relation,
  fkTable: Table,
  pkTable: Table,
  pkColName: string | undefined,
): Column | undefined {
  const fkCols = fkTable.columns.filter((c) => c.keys.fk);

  if (fkCols.length === 0) {
    return guessByNaming(fkTable.columns, pkTable.name, pkColName);
  }
  if (fkCols.length === 1) return fkCols[0];

  if (rel.label) {
    const prefix = `${fkTable.name}_`;
    const suffix = '_foreign';
    if (rel.label.startsWith(prefix) && rel.label.endsWith(suffix)) {
      const colName = rel.label.slice(prefix.length, rel.label.length - suffix.length);
      const col = fkCols.find((c) => c.name === colName);
      if (col) return col;
    }
    if (rel.label.startsWith(prefix)) {
      const colCandidate = rel.label.slice(prefix.length);
      const col = fkCols.find((c) => c.name === colCandidate);
      if (col) return col;
    }
  }

  const guessed = guessByNaming(fkCols, pkTable.name, pkColName);
  if (guessed) return guessed;

  return fkCols[0];
}

function guessByNaming(
  candidates: Column[],
  pkTableName: string,
  pkColName: string | undefined,
): Column | undefined {
  const pkTableLower = pkTableName.toLowerCase();
  const pkColLower = pkColName?.toLowerCase() ?? 'id';

  return (
    candidates.find((c) => c.name.toLowerCase() === `${pkTableLower}_${pkColLower}`) ??
    candidates.find((c) => c.name.toLowerCase() === `${pkTableLower}_id`) ??
    candidates.find(
      (c) =>
        c.name.toLowerCase().includes(pkTableLower) &&
        (c.keys.fk || c.name.toLowerCase().endsWith('_id')),
    )
  );
}
