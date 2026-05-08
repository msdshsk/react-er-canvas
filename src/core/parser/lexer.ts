import { createToken, Lexer } from 'chevrotain';

export const WhiteSpace = createToken({
  name: 'WhiteSpace',
  pattern: /[\s\r\n]+/,
  group: Lexer.SKIPPED,
});

export const GroupStart = createToken({
  name: 'GroupStart',
  pattern: /%%[ \t]*@group[ \t]+[A-Za-z_][A-Za-z0-9_]*/,
});

export const GroupEnd = createToken({
  name: 'GroupEnd',
  pattern: /%%[ \t]*@endgroup\b/,
});

export const Comment = createToken({
  name: 'Comment',
  pattern: /%%[^\r\n]*/,
  group: Lexer.SKIPPED,
});

export const ErDiagram = createToken({
  name: 'ErDiagram',
  pattern: /erDiagram\b/,
});

export const KeyConstraint = createToken({
  name: 'KeyConstraint',
  pattern: /(?:PK|FK|UK)\b/,
});

export const Identifier = createToken({
  name: 'Identifier',
  pattern: /[A-Za-z_][A-Za-z0-9_-]*(?:\([^)\r\n]*\))?/,
});

export const RelSymbol = createToken({
  name: 'RelSymbol',
  pattern: /(?:\|\||\|o|\}\||\}o)(?:--|\.\.)(?:\|\||o\||\|\{|o\{)/,
});

export const StringLiteral = createToken({
  name: 'StringLiteral',
  pattern: /"[^"\r\n]*"/,
});

export const LBrace = createToken({ name: 'LBrace', pattern: /\{/ });
export const RBrace = createToken({ name: 'RBrace', pattern: /\}/ });
export const Colon = createToken({ name: 'Colon', pattern: /:/ });

export const Comma = createToken({
  name: 'Comma',
  pattern: /,/,
  group: Lexer.SKIPPED,
});

export const RefDirective = createToken({
  name: 'RefDirective',
  pattern: /%%[ \t]*@ref[ \t]+[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_-]*[ \t]*->[ \t]*[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_-]*/,
});

export const allTokens = [
  WhiteSpace,
  Comma,
  GroupStart,
  GroupEnd,
  RefDirective,
  Comment,
  ErDiagram,
  KeyConstraint,
  Identifier,
  RelSymbol,
  StringLiteral,
  LBrace,
  RBrace,
  Colon,
];

export const erLexer = new Lexer(allTokens);
