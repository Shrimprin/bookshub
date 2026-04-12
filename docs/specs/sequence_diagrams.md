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

Supabase Auth は PKCE フローを使用し、Web 側は cookie ベースのセッション、拡張機能側は `chrome.storage.session` にアクセストークンを保存する。

```mermaid
sequenceDiagram
    actor User as ユーザー
    participant Web as Web App<br/>(Next.js)
    participant Auth as Supabase Auth
    participant Callback as /auth/callback<br/>(Edge Route)
    participant Ext as Chrome Extension<br/>(Background)
    participant Storage as chrome.storage<br/>.session

    User->>Web: /login にアクセス
    Web->>User: ログインフォーム表示
    User->>Web: 認証情報を入力
    Web->>Auth: signInWithOAuth / signInWithPassword
    Auth-->>Web: 認証 URL / セッション
    Web->>User: Auth プロバイダへリダイレクト
    User->>Auth: 認証同意
    Auth->>Callback: ?code=xxx でリダイレクト
    Callback->>Auth: exchangeCodeForSession(code)
    Auth-->>Callback: セッション (cookie に保存)
    Callback->>User: /bookshelf へリダイレクト

    Note over Web,Ext: ── 拡張機能へのトークン共有 ──

    User->>Web: /bookshelf 表示
    Web->>Web: getSession() でアクセストークン取得
    Web->>Ext: window.postMessage<br/>or chrome.runtime.sendMessage<br/>(access_token)
    Ext->>Storage: setAccessToken(token)
    Storage-->>Ext: OK
    Ext-->>Web: 保存完了
```

### ポイント

- `apps/web/app/auth/callback/route.ts` で PKCE の `code` を `exchangeCodeForSession` に渡し、セッションを cookie に保存する
- 拡張機能は Supabase の cookie を直接読み取れないため、Web App 側からアクセストークンを受け渡してもらう必要がある
- トークンは `chrome.storage.session` に保存され、ブラウザ終了時にクリアされる（永続化しない）

---

## 2. Chrome 拡張機能のスクレイピングフロー

ユーザーが Kindle の購入履歴ページを開いたときに、Content Script がページ内の書籍データを抽出し、API 経由で DB に保存するフロー。

```mermaid
sequenceDiagram
    actor User as ユーザー
    participant Page as Kindle ページ<br/>(Amazon)
    participant CS as Content Script<br/>(kindle.ts)
    participant Parser as parser.ts
    participant Sender as sender.ts
    participant BG as Background SW<br/>(background/index.ts)
    participant Storage as chrome.storage<br/>.session
    participant API as /api/scrape<br/>(Edge Route)
    participant DB as Supabase DB
    participant Tab as 本棚タブ

    User->>Page: 購入履歴ページを開く<br/>(contentlist/booksAll/*)
    Page->>CS: document_idle で<br/>kindle.ts 実行
    CS->>CS: isKindleContentPage() で<br/>URL チェック
    CS->>Page: waitForElement(SELECTORS.bookItem)
    Page-->>CS: 書籍要素が出現
    CS->>Page: querySelectorAll(SELECTORS.bookItem)
    Page-->>CS: 書籍要素配列
    CS->>CS: scrapeKindleBooks()<br/>RawBookData[] を構築

    CS->>Parser: parseBooks(rawBooks, 'kindle')
    Parser->>Parser: extractVolumeNumber()<br/>extractSeriesTitle()
    Parser->>Parser: thumbnailUrl 検証<br/>(https:// チェック)
    Parser-->>CS: ScrapeBook[]

    CS->>Sender: sendScrapedBooks(books)
    Sender->>BG: chrome.runtime.sendMessage<br/>{type: SEND_SCRAPED_BOOKS, books}

    BG->>BG: sender.id === runtime.id チェック
    BG->>Storage: getAccessToken()
    Storage-->>BG: token

    alt token なし
        BG-->>Sender: {success: false, code: AUTH_ERROR}
    else token あり
        BG->>BG: scrapePayloadSchema.safeParse()
        alt バリデーション失敗
            BG-->>Sender: {success: false, code: VALIDATION_ERROR}
        else バリデーション成功
            BG->>API: POST /api/scrape<br/>Authorization: Bearer token<br/>{books}

            API->>API: createClientFromToken(token)
            API->>API: scrapePayloadSchema.safeParse()
            API->>DB: processScrapePayload()
            DB->>DB: 各書籍の book_id 解決<br/>(既存検索 or INSERT)
            DB->>DB: user_books を一括 SELECT<br/>(重複検知)
            DB->>DB: user_books UPSERT
            DB-->>API: {savedCount, duplicateCount, duplicates}
            API-->>BG: 200 OK + ScrapeResponse

            BG->>Storage: setLastSyncResult(result)
            BG->>Tab: chrome.tabs.query({url: bookshelf*})
            Tab-->>BG: 該当タブ一覧
            BG->>Tab: chrome.tabs.reload(tabId)
            BG-->>Sender: {success: true, data}
        end
    end

    Sender-->>CS: response
```

### ポイント

- `manifest.config.ts` の `matches` で `contentlist/booksAll/*` に絞っており、それ以外のページでは Content Script は実行されない
- `parser.ts` は DOM 非依存の純粋関数で、テストしやすい設計
- バリデーションは Content Script 層・Background 層・API 層の 3 重で行う（信頼境界は API 層）
- 同期完了後に `chrome.tabs.reload` で本棚タブを自動リロードし、UI を最新化する
- レート制限は Edge Runtime ではステートレスのため Cloudflare WAF 側で設定する

### エラーパターン

| エラー条件             | コード             | レスポンス              |
| ---------------------- | ------------------ | ----------------------- |
| アクセストークンなし   | `AUTH_ERROR`       | Background が即座に拒否 |
| API が 401             | `AUTH_ERROR`       | 「再ログインが必要」    |
| Zod バリデーション失敗 | `VALIDATION_ERROR` | 詳細メッセージ          |
| API が 400             | `VALIDATION_ERROR` | サーバー側エラー        |
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
