import type { SupabaseClient } from '@supabase/supabase-js'

type DeleteUserBookResult = { message: string } | { error: 'not_found'; message: string }

export async function deleteUserBook(
  supabase: SupabaseClient,
  userId: string,
  userBookId: string,
): Promise<DeleteUserBookResult> {
  const { error, count } = await supabase
    .from('user_books')
    .delete({ count: 'exact' })
    .eq('id', userBookId)
    .eq('user_id', userId)

  if (error) throw new Error(`user_books DELETE failed: ${error.message}`)

  if (count === 0) {
    return { error: 'not_found', message: '指定されたレコードが見つかりません' }
  }

  return { message: 'Deleted' }
}
