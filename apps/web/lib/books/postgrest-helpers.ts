// ilike 用の値を PostgREST `.or()` に安全に埋め込むための 2 段エスケープ。
//
//   1. LIKE メタ文字 (`\`, `%`, `_`) を `\` でエスケープする。`\` を最初にするのは、
//      後続の `\%` / `\_` 置換で生成した `\` を二重エスケープしないため。
//   2. PostgREST のフィルタ値として `.or()` に渡すため、値を `"..."` で囲む。
//      PostgREST の `"..."` 構文では `,` `.` `(` `)` `:` 等の構造的メタ文字が
//      literal 扱いになるが、内側の `"` と `\` は `\` でエスケープが必要。
//
// これにより、ユーザー検索クエリに `,` や `(` 等が含まれても `.or()` の
// フィルタ区切りが誤解釈されない。
export function buildQuotedIlikePattern(value: string): string {
  const likeEscaped = value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
  const pattern = `%${likeEscaped}%`
  const postgrestEscaped = pattern.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return `"${postgrestEscaped}"`
}
