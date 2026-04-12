/**
 * タイトル文字列から巻数を抽出する。
 *
 * 対応パターン:
 *  - 全角括弧: （107）
 *  - 半角括弧: (34)
 *  - 隅付き括弧: 【5】
 *  - 「巻」付き: 72巻, 第42巻
 *  - Vol.: Vol.5, vol.12
 *  - 末尾の数字: ワンピース 107
 */
export function extractVolumeNumber(title: string): number | undefined {
  if (!title) return undefined

  // パターンを優先度順に試行
  const patterns: RegExp[] = [
    // 全角括弧: （107）
    /（(\d+)）/,
    // 半角括弧: (34) — タイトル途中の括弧は除外するため末尾寄りを優先
    /\((\d+)\)(?:\s*$|$)/,
    // 隅付き括弧: 【5】
    /【(\d+)】/,
    // 「第N巻」
    /第(\d+)巻/,
    // 「N巻」
    /(\d+)巻/,
    // Vol.N / vol.N / VOL. N
    /\bvol\.\s*(\d+)/i,
    // 末尾のスペース+数字（タイトルの一部として数字で始まるものは除外）
    /\s(\d+)\s*$/,
  ]

  for (const pattern of patterns) {
    const match = title.match(pattern)
    if (match?.[1]) {
      const num = parseInt(match[1], 10)
      if (num > 0 && num <= 9999) {
        return num
      }
    }
  }

  return undefined
}
