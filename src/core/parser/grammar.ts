import { EmbeddedActionsParser } from 'chevrotain';
import {
  allTokens,
  ErDiagram,
  Identifier,
  LBrace,
  RBrace,
  Colon,
  RelSymbol,
  StringLiteral,
  KeyConstraint,
  GroupStart,
  GroupEnd,
  RefDirective,
} from './lexer';
import type { Cardinality, Column, ERModel, Group, Relation, Table } from '../model';

const LEFT_CARDINALITY: Record<string, Cardinality> = {
  '||': 'one',
  '|o': 'one-or-zero',
  '}|': 'one-or-many',
  '}o': 'zero-or-many',
};

const RIGHT_CARDINALITY: Record<string, Cardinality> = {
  '||': 'one',
  'o|': 'one-or-zero',
  '|{': 'one-or-many',
  'o{': 'zero-or-many',
};

function parseRelSymbol(symbol: string): {
  from: Cardinality;
  to: Cardinality;
  identifying: boolean;
} {
  const identifying = symbol.includes('--');
  const middle = identifying ? '--' : '..';
  const [leftSym, rightSym] = symbol.split(middle);
  return {
    from: LEFT_CARDINALITY[leftSym] ?? 'one',
    to: RIGHT_CARDINALITY[rightSym] ?? 'one',
    identifying,
  };
}

class ERGrammar extends EmbeddedActionsParser {
  private tables: Map<string, Table> = new Map();
  private relations: Relation[] = [];
  private groupOrder: string[] = [];
  private groupMembers: Map<string, string[]> = new Map();
  private currentGroup: string | undefined;
  private lastRelation: Relation | undefined;

  constructor() {
    super(allTokens);
    this.performSelfAnalysis();
  }

  public resetState(): void {
    // Chevrotain's parent class provides its own reset() that clears
    // internal recognizer state (errors, RULE_STACK, lookahead caches).
    // We invoke that here, then clear our domain state.
    super.reset();
    this.tables = new Map();
    this.relations = [];
    this.groupOrder = [];
    this.groupMembers = new Map();
    this.currentGroup = undefined;
    this.lastRelation = undefined;
  }

  public buildModel(): ERModel {
    const groups: Group[] = this.groupOrder.map((name) => ({
      name,
      tables: this.groupMembers.get(name) ?? [],
    }));
    return {
      tables: Array.from(this.tables.values()),
      relations: this.relations,
      groups,
    };
  }

  private ensureTable(name: string): Table {
    let table = this.tables.get(name);
    if (!table) {
      table = { name, columns: [], group: this.currentGroup };
      this.tables.set(name, table);
    }
    if (this.currentGroup && !table.group) {
      table.group = this.currentGroup;
    }
    if (this.currentGroup) {
      const members = this.groupMembers.get(this.currentGroup) ?? [];
      if (!members.includes(name)) {
        members.push(name);
        this.groupMembers.set(this.currentGroup, members);
      }
    }
    return table;
  }

  public diagram = this.RULE('diagram', () => {
    this.CONSUME(ErDiagram);
    this.MANY(() => this.SUBRULE(this.statement));
  });

  private statement = this.RULE('statement', () => {
    this.OR([
      { ALT: () => this.SUBRULE(this.entityOrRelation) },
      {
        ALT: () => {
          const tok = this.CONSUME(GroupStart);
          this.ACTION(() => {
            const match = /@group[ \t]+([A-Za-z_][A-Za-z0-9_]*)/.exec(tok.image);
            const name = match ? match[1] : 'unnamed';
            this.currentGroup = name;
            if (!this.groupMembers.has(name)) {
              this.groupMembers.set(name, []);
              this.groupOrder.push(name);
            }
          });
        },
      },
      {
        ALT: () => {
          this.CONSUME(GroupEnd);
          this.ACTION(() => {
            this.currentGroup = undefined;
          });
        },
      },
      {
        ALT: () => {
          const tok = this.CONSUME(RefDirective);
          this.ACTION(() => {
            const m = /@ref[ \t]+([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_-]*)[ \t]*->[ \t]*([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_-]*)/.exec(
              tok.image,
            );
            if (!m || !this.lastRelation) return;
            const [, aTable, aCol, bTable, bCol] = m;
            const rel = this.lastRelation;
            if (aTable === rel.from && bTable === rel.to) {
              rel.fromColumn = aCol;
              rel.toColumn = bCol;
            } else if (aTable === rel.to && bTable === rel.from) {
              rel.fromColumn = bCol;
              rel.toColumn = aCol;
            }
          });
        },
      },
    ]);
  });

  private entityOrRelation = this.RULE('entityOrRelation', () => {
    const left = this.CONSUME(Identifier).image;
    this.OR([
      {
        ALT: () => {
          const columns = this.SUBRULE(this.entityBody);
          this.ACTION(() => {
            const table = this.ensureTable(left);
            table.columns = columns;
          });
        },
      },
      {
        ALT: () => {
          const symbolToken = this.CONSUME(RelSymbol);
          const right = this.CONSUME2(Identifier).image;
          let label: string | undefined;
          this.OPTION(() => {
            this.CONSUME(Colon);
            this.OR2([
              {
                ALT: () => {
                  label = this.CONSUME3(Identifier).image;
                },
              },
              {
                ALT: () => {
                  const s = this.CONSUME(StringLiteral).image;
                  label = s.slice(1, -1);
                },
              },
            ]);
          });
          this.ACTION(() => {
            this.ensureTable(left);
            this.ensureTable(right);
            const card = parseRelSymbol(symbolToken.image);
            const relation: Relation = {
              id: `${left}__${right}__${this.relations.length}`,
              from: left,
              to: right,
              fromCardinality: card.from,
              toCardinality: card.to,
              identifying: card.identifying,
              label,
            };
            this.relations.push(relation);
            this.lastRelation = relation;
          });
        },
      },
    ]);
  });

  private entityBody = this.RULE('entityBody', (): Column[] => {
    const columns: Column[] = [];
    this.CONSUME(LBrace);
    this.MANY(() => {
      const col = this.SUBRULE(this.attribute);
      columns.push(col);
    });
    this.CONSUME(RBrace);
    return columns;
  });

  private attribute = this.RULE('attribute', (): Column => {
    const type = this.CONSUME(Identifier, { LABEL: 'type' }).image;
    const name = this.CONSUME2(Identifier, { LABEL: 'name' }).image;
    const keys: { pk?: boolean; fk?: boolean; uk?: boolean } = {};
    this.MANY(() => {
      const k = this.CONSUME(KeyConstraint).image.toUpperCase();
      if (k === 'PK') keys.pk = true;
      else if (k === 'FK') keys.fk = true;
      else if (k === 'UK') keys.uk = true;
    });
    let comment: string | undefined;
    this.OPTION(() => {
      const s = this.CONSUME(StringLiteral).image;
      comment = s.slice(1, -1);
    });
    return { type, name, keys, comment };
  });
}

export const erGrammar = new ERGrammar();
