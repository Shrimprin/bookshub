# BookHub ドキュメント

このディレクトリには BookHub プロジェクトの設計・仕様・開発ガイドが格納されています。

---

## ドキュメント一覧

### プロダクト要件 (`requirements/`)

| ファイル                                                              | 内容                                         |
| --------------------------------------------------------------------- | -------------------------------------------- |
| [requirement_definition.md](./requirements/requirement_definition.md) | 要求定義書 — ビジネス要件・機能要件・UX 要件 |
| [mvp.md](./requirements/mvp.md)                                       | MVP 仕様 — 実装対象・対象外機能・検証仮説    |

### 技術仕様 (`specs/`)

| ファイル                                             | 内容                                                                          |
| ---------------------------------------------------- | ----------------------------------------------------------------------------- |
| [architecture.md](./specs/architecture.md)           | アーキテクチャ定義書 — システム構成・ディレクトリ構成・データフロー・設計判断 |
| [sequence_diagrams.md](./specs/sequence_diagrams.md) | シーケンス図 — 認証・スクレイピング・本棚表示・手動登録フロー                 |
| [tech_stack.md](./specs/tech_stack.md)               | 技術スタック定義書 — 各レイヤーの採用技術と選定理由                           |
| [DB_SCHEMA.md](./specs/DB_SCHEMA.md)                 | データベーススキーマ — テーブル定義・RLS ポリシー・インデックス               |
| [openapi.yaml](./specs/openapi.yaml)                 | API 仕様書（OpenAPI 3.1.0） — エンドポイント・リクエスト・レスポンス定義      |

### 開発ガイド (`guides/`)

| ファイル                                    | 内容                                                                        |
| ------------------------------------------- | --------------------------------------------------------------------------- |
| [CONTRIBUTING.md](./guides/CONTRIBUTING.md) | 開発環境セットアップ・コマンドリファレンス・テストガイド・PR チェックリスト |

---

## クイックナビ

**初めてプロジェクトに参加する場合:**

1. [requirement_definition.md](./requirements/requirement_definition.md) — プロダクトの目的と要件を把握
2. [architecture.md](./specs/architecture.md) — システム全体像を把握
3. [CONTRIBUTING.md](./guides/CONTRIBUTING.md) — 開発環境をセットアップ

**API を実装・利用する場合:**

- [openapi.yaml](./specs/openapi.yaml) — エンドポイント仕様を確認（Swagger UI で閲覧可能）
- [DB_SCHEMA.md](./specs/DB_SCHEMA.md) — テーブル構造と RLS ポリシーを確認

**DB を変更する場合:**

- [DB_SCHEMA.md](./specs/DB_SCHEMA.md) — 変更前後のスキーマ差分を必ずここに反映

---

## OpenAPI 仕様の確認方法

`docs/specs/openapi.yaml` は以下のツールで確認できます。

**VS Code 拡張（推奨）:**

- [OpenAPI (Swagger) Editor](https://marketplace.visualstudio.com/items?itemName=42Crunch.vscode-openapi) — ファイルを開くだけでプレビュー表示
- [Swagger Viewer](https://marketplace.visualstudio.com/items?itemName=Arjun.swagger-viewer) — `Shift+Alt+P` でプレビュー

**ブラウザ（オンライン）:**

- [Swagger Editor](https://editor.swagger.io/) に `openapi.yaml` の内容をペースト
