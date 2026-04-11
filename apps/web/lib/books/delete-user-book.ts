import type { SupabaseClient } from '@supabase/supabase-js'

type DeleteUserBookResult = { message: string } | { error: 'not_found'; message: string }

export async function deleteUserBook(
  supabase: SupabaseClient,
  userId: string,
  userBookId: string,
): Promise<DeleteUserBookResult> {
  // Step 1: 対象レコード確認
  const { data: existing, error: selectError } = await supabase
    .from('user_books')
    .select('id')
    .eq('id', userBookId)
    .eq('user_id', userId)
    .single()

  if (selectError || !existing) {
    return { error: 'not_found', message: '指定されたレコードが見つかりません' }
  }

  // Step 2: 削除
  const { error: deleteError } = await supabase
    .from('user_books')
    .delete()
    .eq('id', userBookId)
    .eq('user_id', userId)

  if (deleteError) throw new Error(`user_books DELETE failed: ${deleteError.message}`)

  return { message: 'Deleted' }
}
