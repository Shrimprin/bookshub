import type { SyncResult } from '../types/messages.js'

const STORAGE_KEYS = {
  ACCESS_TOKEN: 'bookhub_access_token',
  LAST_SYNC_RESULT: 'bookhub_last_sync_result',
} as const

export async function getAccessToken(): Promise<string | null> {
  const result = await chrome.storage.session.get([STORAGE_KEYS.ACCESS_TOKEN])
  return (result[STORAGE_KEYS.ACCESS_TOKEN] as string | undefined) ?? null
}

export async function setAccessToken(token: string): Promise<void> {
  await chrome.storage.session.set({ [STORAGE_KEYS.ACCESS_TOKEN]: token })
}

export async function removeAccessToken(): Promise<void> {
  await chrome.storage.session.remove([STORAGE_KEYS.ACCESS_TOKEN])
}

export async function getLastSyncResult(): Promise<SyncResult | null> {
  const result = await chrome.storage.session.get([STORAGE_KEYS.LAST_SYNC_RESULT])
  return (result[STORAGE_KEYS.LAST_SYNC_RESULT] as SyncResult | undefined) ?? null
}

export async function setLastSyncResult(syncResult: SyncResult): Promise<void> {
  await chrome.storage.session.set({ [STORAGE_KEYS.LAST_SYNC_RESULT]: syncResult })
}
