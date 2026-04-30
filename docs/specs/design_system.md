# BookHub デザインシステム

サイバーパンク × ネオンダークを基調とした BookHub UI のデザイントークン仕様。
3 色のネオンを意味付きで使い分ける: **シアン水色 = primary (主操作)**, **緑 = secondary (肯定/成功)**, **ピンク = destructive (警告/エラー)**。

実装の正本は `apps/web/app/globals.css` (CSS 変数 + Tailwind v4 `@theme` マッピング)。
コンポーネント側は **Tailwind ユーティリティ経由** で参照し、HSL や 16 進数の直書きを禁止する。

## 1. テーマ構成

| 観点         | 方針                                                                                |
| ------------ | ----------------------------------------------------------------------------------- |
| デフォルト   | OS 設定追従 (`next-themes` の `enableSystem`)。`ThemeToggle` でユーザーが上書き可能 |
| ダークモード | 主役。漫画書影が浮かび上がるように深いブラック+パープル基調                         |
| ライトモード | サブ。書影視認性を優先し、ネオン感は控えめ。アクセントは同系統色をやや暗く          |
| 切替 UI      | `components/theme-toggle.tsx` (Sun/Moon, hydration safe)                            |

## 2. カラートークン

すべて HSL 三値 (`hsl(var(--token))` で展開)。命名は shadcn 準拠。

### 共通

| 用途     | 変数       |
| -------- | ---------- |
| 角丸基準 | `--radius` |

### ライトモード (`:root`)

| 用途                  | 変数                                         | HSL                           |
| --------------------- | -------------------------------------------- | ----------------------------- |
| 背景                  | `--background`                               | `300 20% 99%`                 |
| 本文                  | `--foreground`                               | `260 20% 12%`                 |
| カード面 / カード文字 | `--card` / `--card-foreground`               | `0 0% 100%` / `260 20% 12%`   |
| ポップオーバー        | `--popover` / `--popover-foreground`         | 同上                          |
| プライマリ (シアン)   | `--primary` / `--primary-foreground`         | `195 90% 42%` / `0 0% 100%`   |
| セカンダリ (緑)       | `--secondary` / `--secondary-foreground`     | `145 65% 35%` / `0 0% 100%`   |
| アクセント            | `--accent` / `--accent-foreground`           | `280 70% 50%` / `0 0% 100%`   |
| ミュート              | `--muted` / `--muted-foreground`             | `280 20% 95%` / `260 10% 45%` |
| 警告 (ピンク)         | `--destructive` / `--destructive-foreground` | `325 85% 52%` / `0 0% 100%`   |
| ボーダー / 入力枠     | `--border` / `--input`                       | `280 25% 88%`                 |
| フォーカスリング      | `--ring`                                     | `195 90% 50%`                 |

### ダークモード (`.dark`)

| 用途                      | 変数                                         | HSL                           |
| ------------------------- | -------------------------------------------- | ----------------------------- |
| 背景                      | `--background`                               | `240 15% 6%`                  |
| 本文                      | `--foreground`                               | `300 20% 96%`                 |
| カード面 / カード文字     | `--card` / `--card-foreground`               | `260 20% 9%` / `300 20% 96%`  |
| プライマリ (シアン水色)   | `--primary` / `--primary-foreground`         | `190 100% 55%` / `240 15% 6%` |
| セカンダリ (緑)           | `--secondary` / `--secondary-foreground`     | `140 90% 55%` / `240 15% 6%`  |
| アクセント (バイオレット) | `--accent` / `--accent-foreground`           | `280 80% 55%` / `300 20% 96%` |
| ミュート                  | `--muted` / `--muted-foreground`             | `260 15% 14%` / `280 15% 65%` |
| 警告 (ピンク/マゼンタ)    | `--destructive` / `--destructive-foreground` | `320 100% 60%` / `240 15% 6%` |
| ボーダー / 入力枠         | `--border` / `--input`                       | `260 40% 22%`                 |
| フォーカスリング          | `--ring`                                     | `190 100% 65%`                |

### 背景装飾 (ダークのみ)

ダークモードの `body::before` に薄いグリッド線 (シアン/バイオレット, opacity 4%, 32px ピッチ) を全画面固定で敷く。
`pointer-events: none; z-index: -1;` のため操作には影響しない。

## 3. グロー shadow

CSS 変数として定義し、Tailwind の `shadow-glow-*` ユーティリティ経由で使用する。

| ユーティリティ          | 変数                      | 用途                                                    |
| ----------------------- | ------------------------- | ------------------------------------------------------- |
| `shadow-glow-primary`   | `--shadow-glow-primary`   | プライマリ CTA / カードホバー / 入力フォーカス (シアン) |
| `shadow-glow-secondary` | `--shadow-glow-secondary` | 緑系バッジ (DMM, 巻数バッジ)                            |
| `shadow-glow-soft`      | `--shadow-glow-soft`      | LP のヒーローバッジ / カード控えめ強調 (バイオレット)   |

ライトモードでは強度を 25% 以下に抑え、書影や本文と干渉させない。

## 4. タイポグラフィ

| 用途                     | フォント                        | Tailwind                 |
| ------------------------ | ------------------------------- | ------------------------ |
| 本文                     | Inter + Noto Sans JP            | `font-sans` (デフォルト) |
| 見出し / ロゴ            | Orbitron + Inter + Noto Sans JP | `font-display`           |
| 数値 / コード / カウンタ | JetBrains Mono                  | `font-mono`              |

- Orbitron は日本語グリフを持たないため、`font-display` も後段に Noto Sans JP を含む
- 本文・カードタイトル・著者名にはグロー (gradient text 含む) を当てない (可読性優先)
- グラデーションテキストは `bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent` のパターンで統一

## 5. variant 一覧

| コンポーネント | variant                                  | 説明                                         |
| -------------- | ---------------------------------------- | -------------------------------------------- |
| Button         | `default`                                | 通常 (ホバーで `shadow-glow-soft`)           |
| Button         | `secondary`                              | 緑基調 (ホバーで `shadow-glow-soft`)         |
| Button         | `destructive`                            | 警告/削除                                    |
| Button         | `outline`                                | 枠線のみ                                     |
| Button         | `ghost`                                  | 背景なし                                     |
| Button         | `link`                                   | リンク調                                     |
| Button         | `neon`                                   | プライマリ + 常時グロー (主要 CTA)           |
| Button         | `neonOutline`                            | 枠線+ホバーでグロー (副 CTA)                 |
| Card           | `interactive` prop                       | 浮き上がり+プライマリグロー (クリッカブル時) |
| Badge          | `neon` / `neonSecondary` / `neonOutline` | グロー強調用                                 |

### StoreBadge マッピング

| ストア   | バッジ variant  | グロー色 |
| -------- | --------------- | -------- |
| `kindle` | `neon`          | シアン   |
| `dmm`    | `neonSecondary` | 緑       |
| `other`  | `neonOutline`   | 枠線のみ |

## 6. ガードレール

1. **CSS 変数を経由しない色 (`text-emerald-700`, `bg-red-500` 等) を直接使わない**。新しい意味色が必要なら `globals.css` にトークンを追加すること
2. **書影の上にグローを当てない**。カード内側ではなく外側 (`Card` の box-shadow) に当てる
3. **グラデーションテキストは見出し限定**。本文・段落には使わない
4. **コントラスト比は WCAG AA を満たす** (本文 4.5:1、大見出し 3:1)。新規色を追加する際は ChromeDevTools / axe で確認
5. **`prefers-reduced-motion: reduce` 環境では transition / animation / shimmer を 0.001ms に縮退**。`globals.css` の `@media` で一括対応済み
6. **テストは role / aria-label / textContent ベース**。Tailwind の色クラス名にアサーションしない (テーマ変更時に壊れる)

## 7. 拡張時のチェックリスト

- [ ] 新しい色は `globals.css` の `:root` と `.dark` 両方に追加したか
- [ ] Tailwind ユーティリティとして使えるよう `@theme inline` にも追加したか
- [ ] ライト/ダーク両モードで視認性 (コントラスト) を確認したか
- [ ] グロー / アニメーションは `prefers-reduced-motion` で抑制されるか
- [ ] 既存テストが pass するか (`pnpm --filter web test`)
