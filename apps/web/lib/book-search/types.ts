// --- 検索パラメータ ---

export type BookSearchParams = {
  query: string
  page?: number | undefined
  limit?: number | undefined
}

// --- 正規化された検索結果 ---

export type BookSearchItem = {
  title: string
  author: string
  isbn?: string | undefined
  volumeNumber?: number | undefined
  thumbnailUrl?: string | undefined
  publishedAt?: string | undefined
}

// --- クライアント関数のシグネチャ型 ---

export type BookSearchFn = (params: BookSearchParams) => Promise<BookSearchClientResult>

export type BookSearchClientResult = {
  items: BookSearchItem[]
  totalCount: number
}

// --- 統合サービスの戻り値（判別共用体） ---

export type BookSearchSuccess = {
  items: BookSearchItem[]
  totalCount: number
  source: 'rakuten' | 'google'
  hasMore: boolean
}

export type BookSearchFailure = {
  items: []
  totalCount: 0
  source: 'none'
  error: string
  hasMore: false
}

export type BookSearchResult = BookSearchSuccess | BookSearchFailure

// --- 楽天ブックスAPI 生レスポンス型 ---

export type RakutenBooksItem = {
  title: string
  author: string
  isbn: string
  largeImageUrl: string
  mediumImageUrl: string
  salesDate: string
  itemPrice: number
  publisherName: string
  booksGenreId: string
}

export type RakutenBooksResponse = {
  count: number
  page: number
  first: number
  last: number
  hits: number
  pageCount: number
  Items: { Item: RakutenBooksItem }[]
}

// --- Google Books API 生レスポンス型 ---

export type GoogleBooksVolumeInfo = {
  title: string
  authors?: string[] | undefined
  publishedDate?: string | undefined
  industryIdentifiers?: { type: string; identifier: string }[] | undefined
  imageLinks?: { thumbnail?: string | undefined; smallThumbnail?: string | undefined } | undefined
}

export type GoogleBooksItem = {
  id: string
  volumeInfo: GoogleBooksVolumeInfo
}

export type GoogleBooksResponse = {
  totalItems: number
  items?: GoogleBooksItem[] | undefined
}
