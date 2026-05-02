# Issue #20: CD ワークフロー — Cloudflare Workers 自動デプロイ

## Context

main ブランチへのマージ後に Cloudflare Workers (`@opennextjs/cloudflare` v1.18.1) へ自動デプロイする CD ワークフローを GitHub Actions で構築する。issue タイトルは「Cloudflare Pages」となっているが、現在の `apps/web/package.json` の `deploy` (`opennextjs-cloudflare deploy`) は内部で `wrangler deploy` を呼ぶ **Workers + Assets** 方式のため、本計画は Workers として実装する。

ストレージバインディング (R2 / KV / D1) は MVP では使用せず、Supabase で完結する構成で進める。

## 影響範囲

- `apps/web/wrangler.jsonc` — 新規作成（Cloudflare Workers 設定）
- ルート `.gitignore` — `.open-next/` `.wrangler/` 除外
- `.github/workflows/ci.yml` — `build` job を `pages:build` に置換（H-5 対応）
- `.github/workflows/cd.yml` — 新規作成（本番 CD）
- `.github/workflows/cd-preview.yml` — 新規作成（PR preview）
- `docs/guides/CONTRIBUTING.md` — Secrets / Branch Protection / Rollback 手順を追記

## 前提

- 完了済み: issue #18 (テストセットアップ)、`.github/workflows/ci.yml` (lint / format / test / build) が動作中
- Cloudflare アカウント / API Token は **未発行**（Phase 3 で発行）
- 本番 Supabase + **preview 用 Supabase の 2 プロジェクト**を Phase 3 着手時までに用意（H-1 対応）
- Worker 名: 本番 `bookhub-web` / preview `bookhub-web-pr-<PR番号>`
- `packages/shared` の dist は git 管理外。CI/CD/local いずれでも `pnpm --filter @bookhub/shared build` を先行実行する

## 主要リスクと対策

| #   | リスク                                     | 対策                                                                                                                                                                              |
| --- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | サーバ専用 secret の漏洩                   | Repository Secrets ではなく **Environment Secrets** (`production` / `preview`) で隔離。`NEXT_PUBLIC_*` は public 露出前提で扱い、サーバ専用 secret には `NEXT_PUBLIC_` を付けない |
| R2  | `NEXT_PUBLIC_*` のビルド時 inline          | client bundle に文字列で焼き込まれることを前提とし、Supabase anon key 等の RLS で保護される値のみを `NEXT_PUBLIC_*` で扱う                                                        |
| R3  | 本番デプロイの取り消し性                   | `environment: production` に required reviewers 設定 + Cloudflare Versions タブからの即時 rollback を一次手段として運用（後述「Rollback 手順」）                                  |
| R4  | `pull_request_target` 経由の secret 漏洩   | preview workflow は `pull_request` のみ、forked PR は `if` で除外                                                                                                                 |
| R5  | wrangler.jsonc 未整備による deploy 失敗    | Phase 1 で先行整備し、ローカル `opennextjs-cloudflare dev` で binding 名を実機確認                                                                                                |
| R6  | CI と CD のビルドパス差分                  | CI の `build` job を `pnpm --filter web pages:build` に置換し、edge runtime 起因のエラーを PR 段階で検出                                                                          |
| R7  | preview の Supabase が本番 DB を汚染       | **preview 専用 Supabase プロジェクトを別建て**。preview environment secrets には preview 用 URL/anon key を登録                                                                   |
| R8  | preview worker の累積 (Free plan 上限 100) | 本 issue では cleanup 未実装。**follow-up issue として登録**                                                                                                                      |
| R9  | third-party action のタグ書き換え攻撃      | Phase 4 では `marocchino/sticky-pull-request-comment` を major tag pin で運用。SHA pin への移行は Dependabot で別途検討                                                           |

---

## Phase 1: `wrangler.jsonc` 整備

> コミット: `chore(web): add wrangler.jsonc for opennextjs-cloudflare deploy`

### 1-1. `apps/web/wrangler.jsonc` を新規作成

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "bookhub-web",
  "main": ".open-next/worker.js",
  "compatibility_date": "2026-05-02",
  "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
  "assets": {
    "directory": ".open-next/assets",
    "binding": "ASSETS",
  },
  "observability": {
    "enabled": true,
  },
}
```

- `compatibility_flags` は OpenNext テンプレート (`node_modules/@opennextjs/cloudflare/templates/wrangler.jsonc`) 準拠で `nodejs_compat` + `global_fetch_strictly_public`。後者は Worker 内部 dispatch を無効化し全 fetch を public internet 経由とするセキュリティフラグ
- R2 / KV / D1 / Service Self-Reference は MVP では追記しない (placeholder も残さない)。導入時は OpenNext のドキュメントに沿って当時の正規構成で追加（L-4）
- `compatibility_date` は実装日に合わせる
- `observability` は Free plan では sampling/quota 制限あり。有料化や request 増加時に再評価（L-1）
- `assets.binding: "ASSETS"` は `node_modules/@opennextjs/cloudflare/templates/wrangler.jsonc` と一致していることを目視確認（M-5）

### 1-2. `.gitignore` 更新

ルート `.gitignore` に以下が無ければ追加:

```
apps/web/.open-next/
.wrangler/
```

### 1-3. ローカル動作確認

```bash
pnpm --filter @bookhub/shared build
pnpm --filter web pages:build
# .open-next/worker.js が生成されることを確認

pnpm --filter web preview
# wrangler dev が起動し、static asset (favicon、/_next/static/...) が 200 で返ることを確認 (M-5)
# binding 名のミスマッチがあればここで 404 / runtime error として検出
```

実 deploy は Phase 3 までしない。

---

## Phase 2: CI build job 置換 + 本番 CD ワークフロー作成

> コミット: `feat(ci): unify build path with pages:build and add CD workflow`

### 2-1. `.github/workflows/ci.yml` の `build` job を `pages:build` に置換

**Why (H-5)**: 現状 CI は `pnpm build` (= `next build`) を回しているが、CD は `opennextjs-cloudflare build` を回す。Edge runtime 起因のエラー (`nodejs_compat` で許されない API、bundle size 超過など) は CI で検出されず本番 deploy 時に初めて落ちる。CI を `pages:build` に統一して PR 段階で検出する。

```yaml
build:
  name: Build
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
      with:
        version: ${{ env.PNPM_VERSION }}
    - uses: actions/setup-node@v4
      with:
        node-version: ${{ env.NODE_VERSION }}
        cache: pnpm
    - run: pnpm install --frozen-lockfile
    - run: pnpm --filter @bookhub/shared build
    - run: pnpm --filter web pages:build
      env:
        # build を成立させるための dummy 値 (NEXT_PUBLIC_* は build 時 inline 必須のため)
        NEXT_PUBLIC_SUPABASE_URL: https://placeholder.supabase.co
        NEXT_PUBLIC_SUPABASE_ANON_KEY: placeholder
```

`apps/extension` 等他パッケージの build を維持したい場合は、`build` を 2 step に分けて `pnpm --filter '!web' build` + `pages:build` の構成にするか、別 job に切り出す。

### 2-2. `.github/workflows/cd.yml` を新規作成

```yaml
name: CD

on:
  push:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: cd-production
  cancel-in-progress: false

env:
  NODE_VERSION: '20'
  PNPM_VERSION: '10'

jobs:
  deploy:
    name: Deploy to Cloudflare Workers
    runs-on: ubuntu-latest
    environment:
      name: production
      url: https://bookhub-web.<account>.workers.dev
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @bookhub/shared build
      - name: Build for Cloudflare
        run: pnpm --filter web pages:build
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}
      - name: Deploy
        run: pnpm --filter web deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

- `concurrency: cancel-in-progress: false` で **デプロイ中の中断を防ぐ**
- 同一 group で 2 件以上 queued になった場合、GitHub Actions は最古以外の queued ジョブを破棄する。連続マージ時は最新コミットのみが deploy される点を運用上許容する。Hot fix を確実に流したい場合は `workflow_dispatch` で再実行する（M-1）
- `environment: production` で Phase 3 の承認制と Secrets 隔離が効く
- `workflow_dispatch` を入れておくと初回手動実行・rollback の再実行が可能

### 2-3. 採用しなかった代替案（PR 説明用メモ）

- **`cloudflare/wrangler-action@v3`**: `opennextjs-cloudflare deploy` が内部で wrangler を呼ぶ二重ラップになり、env 変数経由の認証で十分なため pnpm script 直叩きを採用
- **`wrangler secret put` で Cloudflare 側に env を置く案**: `NEXT_PUBLIC_*` は build 時に inline されるため GitHub Actions 側で env が必要であり、二重管理になるため不採用。サーバ専用 secret (Supabase service_role 等) を将来追加する際は Cloudflare 側 secret も併用する（L-5）

### 2-4. Rollback 手順 (CONTRIBUTING.md にも転記)

main に壊れた変更がマージされて本番が落ちた場合の対応:

| 手段               | 操作                                                                                                                                                           | 所要時間 |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **A (推奨・即効)** | Cloudflare ダッシュボード → `bookhub-web` Worker → **Deployments / Versions** タブから 1 つ前の version を **Rollback** で再 activate                          | < 1 分   |
| **B (Git で戻す)** | 直前の正常 commit に対して `git revert` PR を作成 → main に merge → CD が再走                                                                                  | 5-10 分  |
| **C (将来課題)**   | `wrangler versions upload` + `wrangler versions deploy` ベースの段階的 rollout (gradual deployment) は MVP では導入しないが、本番 traffic が増えた時点で再評価 | —        |

`workflow_dispatch` での再実行は HEAD = 壊れた main commit を再 deploy するだけなので **rollback にならない**点に注意（H-4）。

---

## Phase 3: GitHub / Cloudflare / Supabase 設定（**ユーザー手動作業**）

> コミット: `docs(guides): document CD secrets, branch protection, and rollback`
> このフェーズはコード変更なし、CONTRIBUTING.md への手順追記のみ。実作業は GitHub Web UI / Cloudflare ダッシュボード / Supabase ダッシュボードで実施。

### 3-1. Cloudflare API Token の発行

1. https://dash.cloudflare.com/profile/api-tokens を開く
2. **Create Token** → **Custom token** を選択
3. 以下のパーミッションを設定（**最小権限**、L-3 対応で R2 は除外）:
   - `Account` → `Workers Scripts` → `Edit`
   - `Account` → `Account Settings` → `Read`
   - `User` → `User Details` → `Read`
4. **Account Resources**: 自分のアカウントのみに限定
5. **TTL**: 必要に応じて 1 年などに設定（無期限でも可）
6. 生成された token を控える（ページを離れると再表示不可）
7. R2 / KV / D1 を導入する別 issue では token を再発行 or 権限追加（L-3）

### 3-2. Cloudflare Account ID の取得

1. https://dash.cloudflare.com/ を開く
2. 右サイドバーの **Account ID** をコピー（`Workers & Pages` ページの右側にも表示される）

### 3-3. Supabase プロジェクトの準備（本番 + preview の 2 つ、H-1 対応）

#### 3-3-a. 本番用 Supabase プロジェクト

1. https://supabase.com/dashboard で本番用プロジェクトを開く（既存の開発用を流用 or 新規作成）
2. **Project Settings** → **API**
3. `Project URL` をコピー → `NEXT_PUBLIC_SUPABASE_URL` (production)
4. `anon` `public` キーをコピー → `NEXT_PUBLIC_SUPABASE_ANON_KEY` (production)
5. **Authentication** → **URL Configuration**:
   - **Site URL**: `https://bookhub-web.<account>.workers.dev`（Custom Domain 適用後は更新）
   - **Redirect URLs**: 上記 + ローカル開発用 `http://localhost:3000`（L-7）

#### 3-3-b. preview 用 Supabase プロジェクト（H-1 対応で新規作成）

1. **New Project** で preview 用を作成（命名例: `bookhub-preview`）
2. 本番と同じスキーマを適用（migration を流す）
3. **Project Settings** → **API** から URL / anon key を取得 → preview environment secrets 用に控える
4. **Authentication** → **URL Configuration**:
   - **Site URL**: `https://bookhub-web-pr-1.<account>.workers.dev`（暫定。preview は PR ごとに URL が変わるため後述の Redirect URLs で吸収）
   - **Redirect URLs**: `https://bookhub-web-pr-*.<account>.workers.dev/auth/callback` （Supabase が wildcard 許可する範囲で）+ `http://localhost:3000`

### 3-4. GitHub Environment `production` の作成

1. GitHub リポジトリの **Settings** → **Environments**
2. **New environment** → 名前 `production` で作成
3. 設定項目:
   - **Required reviewers**: 自分自身を追加（誤デプロイ防止のため必須）
   - **Wait timer**: 0 分でよい
   - **Deployment branches and tags**: **Selected branches and tags** → `main` のみ許可

### 3-5. `production` Environment Secrets の登録

`production` environment の **Environment secrets** に以下を追加:

| Secret 名                       | 値                        |
| ------------------------------- | ------------------------- |
| `CLOUDFLARE_API_TOKEN`          | 3-1 で発行した token      |
| `CLOUDFLARE_ACCOUNT_ID`         | 3-2 で取得した Account ID |
| `NEXT_PUBLIC_SUPABASE_URL`      | 3-3-a の Project URL      |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 3-3-a の anon key         |

> **注意**: `NEXT_PUBLIC_*` 接頭辞の値は client bundle に inline される前提のもののみに使用すること。サーバー専用のシークレット (Supabase `service_role` key、外部 API 秘密鍵など) は `NEXT_PUBLIC_` を付けず、Cloudflare 側 (`wrangler secret put`) または GitHub Environment Secrets + サーバー側 env から読む運用に分離する（H-3）。
>
> Repository Secrets ではなく Environment Secrets に登録すること（main 以外のブランチから漏れ得るため）

### 3-6. ブランチ保護ルール (main) の設定

1. **Settings** → **Branches** → **Add branch ruleset** （または classic Branch protection rule）
2. **Branch name pattern**: `main`
3. ルール:
   - **Require a pull request before merging**: ON
     - Required approvals: 0（個人開発なら）または 1
     - Dismiss stale reviews: ON
   - **Require status checks to pass**: ON
     - Required: `Lint`, `Format`, `Test`, `Build`
     - Require branches to be up to date before merging: ON
   - **Restrict deletions**: ON
   - **Require linear history**: 任意（squash merge 運用なら ON 推奨）

> **メモ**: CD は post-merge トリガーなので required status check には含められない。CI の 4 jobs のみが gating に使える（L-6）。

### 3-7. 初回手動デプロイで動作確認

1. `cd.yml` がマージされた後、**Actions** タブから `CD` ワークフローを `workflow_dispatch` で手動実行
2. **Review deployments** で `production` environment を承認
3. ワークフローの各ステップが緑になることを確認
4. Cloudflare ダッシュボードで `bookhub-web` Worker が作成され、URL `https://bookhub-web.<account>.workers.dev` でアクセスできることを確認
5. ログイン画面まで表示されれば OK

### 3-8. `docs/guides/CONTRIBUTING.md` への追記

3-1 〜 3-7 の手順 + Phase 2-4 の Rollback 手順をプロジェクト docs に転記し、新規参加者が再現できるようにする。

### 3-9. GitHub Environment `preview` の作成と Secrets 登録（B-2 対応）

Phase 4 着手前に必要。

1. **Settings** → **Environments** → **New environment** → 名前 `preview` で作成
2. 設定項目:
   - **Required reviewers**: 設定なし（PR ごとに承認待ちは過剰）
   - **Deployment branches and tags**: **All branches** （または同一リポジトリの全ブランチ）
3. `preview` environment の **Environment secrets** に以下を追加:

| Secret 名                       | 値                                                              |
| ------------------------------- | --------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`          | 3-1 と同じ token を流用可（または preview 専用 token を別発行） |
| `CLOUDFLARE_ACCOUNT_ID`         | 3-2 と同じ                                                      |
| `NEXT_PUBLIC_SUPABASE_URL`      | **3-3-b の preview 用 Project URL**（本番とは別！）             |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **3-3-b の preview 用 anon key**（本番とは別！）                |

> GitHub の environment secrets は他 environment から参照できないため、`production` と `preview` で別々に登録する必要がある。

### 3-10. Custom Domain（本 issue 範囲外・follow-up）

本 issue では `*.workers.dev` ドメインで運用。Custom Domain 適用時に必要な作業を **follow-up issue として別途登録**:

- Cloudflare Workers Custom Domains の設定
- Supabase Auth Site URL / Redirect URLs を Custom Domain に更新
- CSP の `connect-src` 等を Custom Domain に更新

---

## Phase 4: PR Preview Deployment

> コミット: `feat(ci): add preview deployment for pull requests`

**前提**: Phase 3-3-b（preview Supabase）と Phase 3-9（preview environment + secrets）が完了していること。

### 4-1. `.github/workflows/cd-preview.yml` を新規作成

```yaml
name: CD Preview

on:
  pull_request:
    branches: [main]
    types: [opened, synchronize, reopened]

concurrency:
  group: cd-preview-${{ github.event.pull_request.number }}
  cancel-in-progress: true

env:
  NODE_VERSION: '20'
  PNPM_VERSION: '10'

jobs:
  preview:
    name: Deploy Preview
    if: github.event.pull_request.head.repo.full_name == github.repository
    runs-on: ubuntu-latest
    environment:
      name: preview
      url: https://bookhub-web-pr-${{ github.event.pull_request.number }}.<account>.workers.dev
    permissions:
      contents: read
      pull-requests: write # marocchino/sticky-pull-request-comment で PR にコメントを投稿するため必須。コメントを廃止する場合は read まで下げる (M-2)
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @bookhub/shared build
      - name: Build for Cloudflare
        run: pnpm --filter web pages:build
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}
      - name: Deploy preview
        id: deploy
        run: |
          pnpm --filter web exec -- opennextjs-cloudflare deploy \
            --name "bookhub-web-pr-${{ github.event.pull_request.number }}"
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
      - name: Comment preview URL on PR
        uses: marocchino/sticky-pull-request-comment@v2
        with:
          header: preview
          message: |
            Preview deployed: https://bookhub-web-pr-${{ github.event.pull_request.number }}.<account>.workers.dev
```

### 4-2. セキュリティ要件

- `if: github.event.pull_request.head.repo.full_name == github.repository` で **forked PR からの secret 漏洩を防ぐ**
- `pull_request_target` は使用しない
- preview の secrets は **本番とは別の Supabase プロジェクトを参照**（H-1 / B-2）
- `marocchino/sticky-pull-request-comment@v2` は major tag pin で運用。Dependabot の `github-actions` ecosystem を有効化し、SHA pin 化は別 issue で検討（M-3 / R9）。代替案として `environment.url` のみで deployment view から URL に飛べるため、third-party action 依存を回避したい場合はコメント step を削除可

### 4-3. PR クローズ時のクリーンアップ（follow-up issue として登録）

PR がマージ / クローズされても preview worker が残り続ける問題（M-4 / R8）。本 issue では cleanup を実装しないが、`closed` トリガーで `wrangler delete --name bookhub-web-pr-${{ github.event.pull_request.number }}` を呼ぶ workflow を **follow-up issue として登録**する。

Cloudflare Free plan の worker 上限は 100。週 5 PR 想定で 20 週 ≒ 5 ヶ月で枯渇する見積もりのため、それまでに follow-up を実装する。

---

## 各 Phase の検証

| Phase | 検証手段                                                                                                                                                                                                 |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | (a) ローカルで `pnpm --filter web pages:build` が成功し `.open-next/worker.js` が生成。(b) `pnpm --filter web preview` で wrangler dev を起動し、static asset が 200 で返ることで binding 名整合性を確認 |
| 2     | (a) feature branch で `cd.yml` をコミット → main マージ前に YAML 構文エラー無し / CI の置換した `build` job が成功することを GitHub Actions UI で確認                                                    |
| 3     | 3-7 の手動デプロイが成功し、Worker URL でログイン画面が表示される                                                                                                                                        |
| 4     | テスト用 PR を作成し、preview URL がコメントされ、URL でログイン画面が表示される。Auth callback が preview Supabase 側で動作することを確認                                                               |

## 推定工数

| Phase                | 内容                                                                                             | 推定時間    |
| -------------------- | ------------------------------------------------------------------------------------------------ | ----------- |
| 1                    | wrangler.jsonc + .gitignore + ローカル binding 確認                                              | 1.0h        |
| 2                    | CI build job 置換 + cd.yml 作成 + Rollback 手順策定                                              | 1.5h        |
| 3                    | Cloudflare token + 本番/preview Supabase + GitHub environments + ブランチ保護 + ドキュメント追記 | 2.5h        |
| 4                    | preview workflow                                                                                 | 1.5h        |
| トラブルシュート余裕 |                                                                                                  | 1.5h        |
| **合計**             |                                                                                                  | **約 8.0h** |

## Follow-up Issues（本 issue 完了時に登録）

- **Custom Domain 適用**（3-10 / M-6）
- **Preview worker のクリーンアップ workflow**（4-3 / M-4 / R8）
- **third-party action の SHA pin 移行 + Dependabot github-actions 有効化**（M-3 / R9）
- **Cloudflare Workers Versions / Gradual Deployments の本番投入検討**（traffic 増加時、H-4 / 2-4 手段 C）
