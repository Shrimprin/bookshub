// Cloudflare Workers の custom entrypoint。
// OpenNext が生成する fetch ハンドラを再利用しつつ、Cron Trigger 用の
// scheduled ハンドラを追加するために存在する。
//
// 設計判断:
//   - Next.js Route Handler は scheduled イベントを直接受けられないため、
//     OpenNext の Custom Worker パターン (https://opennext.js.org/cloudflare/howtos/custom-worker)
//     に従い、本ファイルを wrangler.jsonc の `main` に指定する。
//   - scheduled() 内では HTTP self-fetch 経由ではなく Supabase service-role
//     client を直接使って refresh サイクルを回す。subrequest 数を抑え、
//     Cloudflare 無料プランの 50 subrequests/req 制限内に収める。
//   - 例外は scheduled の戻り値で握り潰さず再 throw する。Cloudflare は失敗を
//     observability tab に記録し、次回 cron で再試行される。

// @ts-expect-error `.open-next/worker.js` は build 時に OpenNext が生成する
import { default as openNextHandler } from './.open-next/worker.js'
import { runNextVolumeRefreshCycle } from './lib/next-volume/run-next-volume-refresh'
import { createServiceRoleClient } from './lib/supabase/service-role'

const CRON_BATCH_SIZE = 3
const CRON_SLEEP_MS = 1100

export default {
  fetch: openNextHandler.fetch,

  async scheduled(_controller, _env, ctx) {
    ctx.waitUntil(runRefreshCycle())
  },
} satisfies ExportedHandler<unknown>

async function runRefreshCycle(): Promise<void> {
  const startedAt = Date.now()
  try {
    const supabase = createServiceRoleClient()
    const result = await runNextVolumeRefreshCycle(supabase, {
      batchSize: CRON_BATCH_SIZE,
      sleepMs: CRON_SLEEP_MS,
    })
    console.log('[cron/refresh-next-volumes]', {
      processed: result.processed,
      errors: result.errors,
      durationMs: Date.now() - startedAt,
    })
  } catch (err) {
    console.error('[cron/refresh-next-volumes] cycle failed:', err)
    throw err
  }
}
