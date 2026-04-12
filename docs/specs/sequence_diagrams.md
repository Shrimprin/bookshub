# BookHub シーケンス図

主要なユースケースのシーケンス図を Mermaid 形式でまとめたドキュメント。

実装と乖離した場合はソース側を真実とし、本ドキュメントを更新すること。

---

## 目次

1. [認証フロー](#1-認証フロー)
2. [Chrome 拡張機能のスクレイピングフロー](#2-chrome-拡張機能のスクレイピングフロー)
3. [本棚表示フロー](#3-本棚表示フロー)
4. [手動書籍登録フロー](#4-手動書籍登録フロー)

---

## 1. 認証フロー

ユーザーが Web アプリにログインし、その後 Chrome 拡張機能がそのセッションを利用できるようになるまでの流れ。

Supabase Auth は PKCE フローを使用する。Web 側は cookie ベースのセッション、拡張機能側は `chrome.storage.local` にアクセストークンを保存する。Web から拡張機能へのトークン受け渡しには Chrome 公式の `externally_connectable` + `chrome.runtime.sendMessage` を用いる。

```mermaid
sequenceDiagram
    actor User as ユーザー
    participant Login as LoginForm<br/>(Client Component)
    participant Auth as Supabase Auth<br/>(Google OAuth)
    participant Callback as /auth/callback<br/>(Route Handler)
    participant Layout as (protected)/layout<br/>(Server Component)
    participant Bridge as ExtensionTokenBridge<br/>(Client Component)
    participant Sync as syncTokenOnAuthChange
    participant Sender as sendTokenToExtension
    participant BG as Background SW<br/>(onMessageExternal)
    participant Storage as chrome.storage<br/>.local

    User->>Login: /login にアクセス
    Login->>Auth: signInWithOAuth('google')
    Auth-->>User: Google 認証ページへリダイレクト
    User->>Auth: 認証同意
    Auth->>Callback: ?code=xxx でリダイレクト
    Callback->>Auth: exchangeCodeForSession(code)
    Auth-->>Callback: セッション (cookie に保存)
    Callback->>User: /bookshelf へリダイレクト

    Note over Layout,Storage: ── 保護レイアウトでのトークン同期 ──

    User->>Layout: /bookshelf (RSC)
    Layout->>Layout: getUser() で認証確認
    Layout-->>User: HTML + ExtensionTokenBridge を含む
    User->>Bridge: マウント (useEffect 発火)
    Bridge->>Auth: supabase.auth.getSession()
    Auth-->>Bridge: session (access_token)
    Bridge->>Sync: syncTokenOnAuthChange('INITIAL_SESSION', session)
    Sync->>Sender: sendTokenToExtension(token)
    Sender->>BG: chrome.runtime.sendMessage<br/>(EXTENSION_ID, {type:'SET_ACCESS_TOKEN', token})
    BG->>BG: isAllowedOrigin(sender.origin) 検証
    BG->>BG: Zod バリデーション
    BG->>Storage: setAccessToken(token)
    Storage-->>BG: OK
    BG-->>Sender: {success: true}

    Note over Bridge,Storage: ── セッション更新時の再同期 ──

    Auth-->>Bridge: onAuthStateChange('TOKEN_REFRESHED', session)
    Bridge->>Sync: syncTokenOnAuthChange('TOKEN_REFRESHED', session)
    Sync->>Sender: sendTokenToExtension(newToken)
    Sender->>BG: SET_ACCESS_TOKEN で再送
    BG->>Storage: setAccessToken(newToken) で上書き

    Note over Bridge,Storage: ── ログアウト ──

    User->>Bridge: ログアウト操作
    Auth-->>Bridge: onAuthStateChange('SIGNED_OUT', null)
    Bridge->>Sync: syncTokenOnAuthChange('SIGNED_OUT', null)
    Sync->>Sender: sendTokenToExtension(null)
    Sender->>BG: CLEAR_ACCESS_TOKEN
    BG->>Storage: removeAccessToken()
```

### ポイント

- **PKCE コード交換**: `apps/web/app/auth/callback/route.ts` で `exchangeCodeForSession` を実行し、セッションを cookie に保存
- **`ExtensionTokenBridge`**: `apps/web/components/auth/extension-token-bridge.tsx` は Client Component で、`app/(protected)/layout.tsx` に配置される。`useEffect` 内で `getSession()` による初期同期と `onAuthStateChange` 購読を行う
- **Chrome 公式経路**: 拡張機能は Supabase の cookie を直接読めないため、`externally_connectable.matches` に登録された Web オリジンからの `chrome.runtime.sendMessage` で通信する
- **オリジン検証**: Background の `handleExternalMessage` は `sender.origin` を `__ALLOWED_EXTERNAL_ORIGINS__` (vite define 経由で注入) で厳密一致検証する
- **トークン保存**: `chrome.storage.local` に保存し、拡張機能 reload / ブラウザ再起動を跨いで保持される。Supabase access token は 1 時間で失効するため、ディスク漏洩時の悪用期間は限定的
- **`TOKEN_REFRESHED` での再送**: Supabase の自動トークン更新時も Bridge が検知して拡張機能側を最新化する
- **ブラウザ互換**: `sendTokenToExtension` は `chrome` 未定義 (Firefox/Safari/SSR) や拡張機能未インストール時は no-op で安全にスキップする
- **Extension ID 固定化**: CRXJS の `publicKey` オプション (`CRX_PUBLIC_KEY` 環境変数経由) で dev/staging の Extension ID を固定し、Web アプリ側の `NEXT_PUBLIC_EXTENSION_ID` と一致させる

---

## 2. Chrome 拡張機能のスクレイピングフロー

ユーザーが Kindle の購入履歴ページを開いたときに、Content Script がページ内の書籍データを抽出し、API 経由で DB に保存するフロー。

Kindle 購入履歴ページは `?pageNumber=N` クエリで完全ナビゲーションするため、Content Script は各ページ遷移で再起動される。`chrome.storage.local` の `bookhub_scrape_session_v1` に進行状態を保存し、複数ページの書籍を累積してから 1 回の API 呼び出しで送信する。

```mermaid
sequenceDiagram
    actor User as ユーザー
    participant Page as Kindle ページ<br/>(Amazon)
    participant CS as Content Script<br/>(kindle.ts)
    participant Session as scrape-session.ts<br/>(純粋関数)
    participant Parser as parser.ts
    participant Storage as chrome.storage<br/>.local
    participant BG as Background SW<br/>(background/index.ts)
    participant API as /api/scrape<br/>(Edge Route)
    participant DB as Supabase DB
    participant Tab as 本棚タブ

    User->>Page: 購入履歴ページを開く<br/>(contentlist/booksAll/*)

    loop 全ページを順次処理 (?pageNumber=1..N)
        Page->>CS: document_idle で<br/>kindle.ts 実行 (再起動)
        CS->>CS: extractPageNumber(URL)
        CS->>Storage: getScrapeSession()
        alt 既存セッションあり
            CS->>Session: isSessionStale / originalUrl 検証
            alt 5 分以上前 / URL 不一致 / 連続性破綻
                CS->>Storage: clearScrapeSession()
                CS->>Session: createEmptySession()
            else 有効
                CS->>CS: 既存セッションを使用
            end
        else セッションなし
            CS->>Session: createEmptySession()
        end

        CS->>Page: scrapeKindleBooks()
        Page-->>CS: RawBookData[]
        CS->>Parser: parseBooks(rawBooks, 'kindle')
        Parser-->>CS: ScrapeBook[]
        CS->>Session: mergeBooks(existing, newBooks)
        Session-->>CS: 累積後の books

        CS->>Page: findPageLinkByNumber(currentPage + 1)
        alt 次ページあり
            CS->>Storage: setScrapeSession(updated)
            CS->>Page: window.location.href = ?pageNumber=N+1
            Note over Page: ページ遷移 → CS 再起動
        else 最終ページ
            CS->>BG: sendScrapedBooks(allBooks)
            BG->>BG: sender.id 検証
            BG->>Storage: getAccessToken()
            Storage-->>BG: token
            BG->>BG: scrapePayloadSchema.safeParse()
            BG->>API: POST /api/scrape<br/>Authorization: Bearer token
            API->>API: createClientFromToken(token)
            API->>DB: processScrapePayload()
            DB->>DB: book_id 解決 + user_books UPSERT
            DB-->>API: {savedCount, duplicateCount, duplicates}
            API-->>BG: 200 OK
            BG->>Storage: setLastSyncResult(result)
            BG->>Tab: chrome.tabs.query + reload
            BG-->>CS: {success: true, data}
            CS->>Storage: clearScrapeSession()
        end
    end
```

### ポイント

- `manifest.config.ts` の `matches` で `contentlist/booksAll/*` に絞っており、それ以外のページでは Content Script は実行されない
- `parser.ts` および `scrape-session.ts` は DOM 非依存の純粋関数で、ユニットテスト容易性を確保
- バリデーションは Content Script 層・Background 層・API 層の 3 重で行う（信頼境界は API 層）
- ページネーション中にユーザーがタブを閉じた場合、5 分以内に再訪すれば続きから再開、5 分超で破棄
- セーフティ: 累積 500 冊または 50 ページ到達で強制送信 (`scrapePayloadSchema.books.max(500)` と一致)
- AUTH_ERROR / NETWORK_ERROR 時はセッションを保持して、ログイン後の再訪で再送可能
- 同期完了後に `chrome.tabs.reload` で本棚タブを自動リロードし、UI を最新化する
- レート制限は Edge Runtime ではステートレスのため Cloudflare WAF 側で設定する

### エラーパターン

| エラー条件             | コード             | レスポンス              |
| ---------------------- | ------------------ | ----------------------- |
| アクセストークンなし   | `AUTH_ERROR`       | Background が即座に拒否 |
| API が 401             | `AUTH_ERROR`       | 「再ログインが必要」    |
| Zod バリデーション失敗 | `VALIDATION_ERROR` | 詳細メッセージ          |
| API が 400             | `VALIDATION_ERROR` | リクエスト不正          |
| API が 5xx             | `API_ERROR`        | サーバーエラー          |
| `fetch` 失敗           | `NETWORK_ERROR`    | ネットワークエラー      |

---

## 3. 本棚表示フロー

ユーザーが Web アプリの本棚ページを開いて、自分の蔵書を一覧表示するまでの流れ。

```mermaid
sequenceDiagram
    actor User as ユーザー
    participant Browser as ブラウザ
    participant Page as /bookshelf<br/>(RSC)
    participant Auth as Supabase Auth<br/>(cookie)
    participant API as /api/books<br/>(Edge Route)
    participant Repo as get-user-books.ts
    participant DB as Supabase DB<br/>(RLS 有効)

    User->>Browser: /bookshelf にアクセス
    Browser->>Page: GET /bookshelf
    Page->>Auth: createClient() でセッション取得
    Auth-->>Page: { user, accessToken }

    alt 未認証
        Page->>Browser: /login へリダイレクト
    else 認証済み
        Page->>API: GET /api/books?<br/>q=...&store=...&page=1
        API->>API: Authorization: Bearer token
        API->>Auth: createClientFromToken(token)
        Auth-->>API: { supabase, user }

        API->>API: getBooksQuerySchema.safeParse()
        API->>Repo: getUserBooks(supabase, user.id, query)
        Repo->>DB: SELECT user_books<br/>JOIN books ON book_id<br/>WHERE user_id = auth.uid()
        Note over DB: RLS により<br/>auth.uid() で自動フィルタ
        DB-->>Repo: 書籍一覧
        Repo-->>API: { books, total, page }
        API-->>Page: 200 OK + JSON
        Page->>Page: shadcn/ui で書影グリッド描画
        Page-->>Browser: HTML
        Browser-->>User: 本棚 UI 表示
    end
```

### ポイント

- Server Component (RSC) からの fetch なので `cookie` ベースのセッション情報を使用
- Supabase の Row Level Security により、`user_books.user_id = auth.uid()` のレコードのみ取得される（API 層でユーザー ID をフィルタする必要がない）
- クエリパラメータでタイトル/著者検索・ストアフィルタ・ページネーションをサポート

---

## 4. 手動書籍登録フロー

ユーザーが書籍名で検索し、楽天ブックス API / Google Books API の結果から手動で蔵書に追加するフロー。

```mermaid
sequenceDiagram
    actor User as ユーザー
    participant UI as 検索 UI
    participant Search as /api/books/search<br/>(Edge Route)
    participant Service as book-search-service.ts
    participant Rakuten as 楽天ブックス API
    participant Google as Google Books API
    participant Register as POST /api/books<br/>(Edge Route)
    participant Repo as register-book.ts
    participant DB as Supabase DB

    User->>UI: 「ワンピース 107」と入力
    UI->>Search: GET /api/books/search?q=ワンピース+107
    Search->>Search: parseSearchQuery() で<br/>クエリ正規化
    Search->>Service: searchBooks({q, page, limit})

    Service->>Rakuten: 書籍検索
    Rakuten-->>Service: 検索結果
    alt 楽天が空 or 失敗
        Service->>Google: フォールバック検索
        Google-->>Service: 検索結果
    end

    Service-->>Search: { source, books }
    alt API キー未設定
        Search-->>UI: 503 Service Unavailable
    else 正常
        Search-->>UI: 200 OK + 書籍候補一覧
    end

    UI->>User: 候補をリスト表示
    User->>UI: 1 件選択して「登録」

    UI->>Register: POST /api/books<br/>{title, author, volumeNumber, ...}
    Register->>Register: registerBookSchema.safeParse()
    Register->>Repo: registerBook(supabase, user.id, data)

    Repo->>DB: SELECT books WHERE<br/>title=? AND author=? AND volume=?
    alt 書籍マスタ未登録
        Repo->>DB: INSERT INTO books
    end
    Repo->>DB: SELECT user_books WHERE<br/>user_id=? AND book_id=?
    alt 既に所有
        Repo-->>Register: { error: 'already_owned' }<br/>(二度買い防止アラート)
        Register-->>UI: 409 Conflict
        UI->>User: 「既に所有しています」警告
    else 未所有
        Repo->>DB: INSERT INTO user_books<br/>(store='other')
        Repo-->>Register: { book }
        Register-->>UI: 201 Created
        UI->>User: 「登録しました」
    end
```

### ポイント

- 検索は楽天ブックス API を第一優先、Google Books API をフォールバックとする
- API キー未設定は内部設定の問題なので、設定情報を漏洩させないよう 503 で返す
- 手動登録時の `store` は `other` 固定（Kindle/DMM はスクレイピング経由のみ）
- 二度買い防止アラートは 409 Conflict で返却し、UI 側で警告表示

---

## 更新ルール

- API エンドポイント・メッセージ型・DB スキーマを変更した場合、対応するシーケンス図を更新すること
- 新しいユースケース（フェーズ 2 の通知機能など）は新しいセクションとして追加すること
- 図の中で参照するファイル名は、リファクタリング時に grep で検出できるよう正確に書くこと
