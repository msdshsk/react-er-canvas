# @msdshsk/react-er-canvas

[English README](./README.md)

React / Electron 上で Mermaid 形式の ER 図を描画する Reactコンポーネントライブラリ。Mermaid 標準のレンダラには無い以下の視覚的拡張機能を備えています:

- **カラム単位の FK 接続線** （`users.id` から `orders.user_id` へ、テーブル間ではなく該当カラム行同士を直接結ぶ）
- **テーブルカードのドラッグ移動** （`positions` / `onPositionsChange` で位置の永続化が可能）
- **ホバー時の FK 参照ハイライト**
- **PK / FK / UK / 型 / コメント** をカラム単位で描画
- **スキーマグループ** （`%% @group` ディレクティブ ─ 標準 Mermaid と互換性のあるコメント形式）
- **手動 JOIN 作成** （カラム同士のドラッグ＆ドロップ。クエリビルダ UI 用途）
- **カラム選択** （チェックボックス。クエリビルダ UI 用途）

[`@xyflow/react`](https://reactflow.dev/) と [`elkjs`](https://github.com/kieler/elkjs)、自前実装の [`chevrotain`](https://chevrotain.io/) パーサで構成されています。

## インストール

```sh
npm install @msdshsk/react-er-canvas @xyflow/react react react-dom
```

`@xyflow/react`、`react`、`react-dom` は **peer dependency** なので、利用側のアプリで明示的にインストールしてください。

加えて、React Flow のスタイルシートを利用側アプリで **一度** import する必要があります:

```ts
import '@xyflow/react/dist/style.css';
```

## 使い方 ─ Mermaid ソースから

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

## 使い方 ─ 構築済みモデルを直接渡す（パース処理を省略）

利用側のアプリが既に構造化スキーマデータを持っている場合（例: `INFORMATION_SCHEMA` から取得した情報）、Mermaid 文字列を経由せずに `model` prop で直接渡せます:

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

`source` と `model` は排他です。両方渡された場合は `model` が優先されます。

## 使い方 ─ Query Builder モード

カラムチェックボックスと手動 JOIN を組み合わせて、ビジュアルなクエリ構築 UI を作れます:

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
        // ダイアログを開いて JOIN タイプを訊いた上で:
        // setJoins([...joins, { id: ..., source: s as ColumnRef, target: t as ColumnRef, type: 'INNER' }]);
      }}
      onJoinDelete={(id) => setJoins(joins.filter((j) => j.id !== id))}
    />
  );
}
```

リポジトリ内 `examples/web/` に完全なデモが入っています（サンプル切替・SQL 生成・位置永続化・レイアウトアルゴリズム選択・テーブル削除）。

## Mermaid 互換の拡張ディレクティブ

以下のディレクティブはコメント形式で書かれているため、**標準 Mermaid レンダラに食わせても無害**です:

```mermaid
%% @group public
CUSTOMER { int id PK }
ORDER    { int id PK }
%% @endgroup

%% @ref CUSTOMER.id -> ORDER.customer_id
```

- **`%% @group <名前>`** ... **`%% @endgroup`** ─ 内部のテーブルをスキーマ/名前空間としてグルーピング。ヘッダーに色付きバッジが表示されます。
- **`%% @ref <Table>.<col> -> <Table>.<col>`** ─ FK カラムを明示指定するオーバーライド。直前のリレーションに適用されます。自動推論で曖昧になる場合（例: `users` → `comments` の FK が複数本ある）に使用してください。

## FK カラムの自動推論

`A ||--o{ B` の関係が宣言されると、本ライブラリは `A` （PK 側）のどのカラムが `B` （FK 側）のどのカラムに対応するかを以下の優先順位で推論します:

1. **`%% @ref` ディレクティブ** （常に最優先）
2. **Laravel 形式のラベル** ─ リレーションのラベルが `<fkテーブル>_<カラム>_foreign` パターンなら FK カラムを特定
3. **ゆるいラベルマッチ** ─ `<fkテーブル>_<カラム>` パターン
4. **命名規則** ─ FK 側に `<pkテーブル>_<pkカラム>` または `<pkテーブル>_id` という名前のカラム
5. **単一 FK フォールバック** ─ FK テーブル内に FK カラムが 1 つしか無ければそれ
6. **先頭 FK フォールバック** ─ 最終手段として最初の FK カラム

## レイアウト

[elkjs](https://github.com/kieler/elkjs) で実装。以下の prop で調整可能です:

```tsx
<MermaidER
  algorithm="layered"     // 'layered' | 'stress' | 'force' | 'mrtree' | 'rectpacking' | 'radial'
  direction="DOWN"        // 'DOWN' | 'RIGHT' | 'LEFT' | 'UP' (layered/mrtree のみ有効)
  aspectRatio={16/9}      // 目標アスペクト比 ─ 層を折り返してフィットさせる
/>
```

デフォルトは `layered` + `DOWN`。

インタラクティブな編集（textarea で source を編集など）を扱う場合、**利用側で source 更新をデバウンスしてください**。本ライブラリは `source` が変わるたびに同期的に再パース・再レイアウトするためです。

## 位置の永続化

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

`positions` に存在しないテーブルは自動レイアウト結果が使われます。複数選択ドラッグ（Shift+drag で範囲選択 → ドラッグ）も対応済みで、`onPositionsChange` には移動した全テーブルの新位置が渡されます。

## 公開 API

```ts
import {
  MermaidER,
  parseMermaidER,
  layoutER,
  MermaidERParseError,
} from '@msdshsk/react-er-canvas';
```

完全な型は package ルートからエクスポートされます: `MermaidERProps`、`ERModel`、`Table`、`Column`、`Relation`、`Group`、`ColumnRef`、`PartialColumnRef`、`Join`、`JoinType`、`LayoutOptions`、`LayoutAlgorithm`、`LayoutDirection`、`NodePositions`、`NodePosition`、`LayoutResult`、`PositionedNode`、`PositionedEdge`、`EdgePoint`、`Cardinality`、`ColumnKey`。

React 非依存のヘッドレス用途には `@msdshsk/react-er-canvas/core` サブパスが用意されています（パース + レイアウトのみ、レンダリング無し）。

## ライセンス

MIT ─ [LICENSE](./LICENSE) を参照。

依存ライブラリのライセンス（Apache-2.0 / EPL-2.0 / MIT）と帰属表示については [NOTICE](./NOTICE.md) を参照してください。
