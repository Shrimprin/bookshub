import { z } from 'zod'

// Web アプリから拡張機能への外部メッセージ（chrome.runtime.sendMessage 経由）
// 内部メッセージ (ExtensionMessage) とは完全に分離し、ハンドラ混同を型レベルで防ぐ

export const setAccessTokenMessageSchema = z.object({
  type: z.literal('SET_ACCESS_TOKEN'),
  token: z.string().min(1).max(8192),
})

export const clearAccessTokenMessageSchema = z.object({
  type: z.literal('CLEAR_ACCESS_TOKEN'),
})

export const externalExtensionMessageSchema = z.discriminatedUnion('type', [
  setAccessTokenMessageSchema,
  clearAccessTokenMessageSchema,
])

export type SetAccessTokenMessage = z.infer<typeof setAccessTokenMessageSchema>
export type ClearAccessTokenMessage = z.infer<typeof clearAccessTokenMessageSchema>
export type ExternalExtensionMessage = z.infer<typeof externalExtensionMessageSchema>

export type ExternalMessageResponse = { success: true } | { success: false; error: string }
