// Background / Content Script 双方が参照する横断定数。
// 片方だけ変更してもう片方と整合が崩れる事故を防ぐため、ここに集約する。

// Web 本棚から trigger を受けてから content script の main() がスクレイプを完走する
// (もしくは復帰不能エラーで cleanup が走る) までの安全網となる TTL。
// この時間を超えた flag は孤児と見做して Background が新規 trigger を受け付け、
// content script は早期 return + flag clear する。
export const TRIGGER_TTL_MS = 10 * 60 * 1000

// trigger の発火元。
// - 'web': Web 本棚ボタン押下で Background が tabs.create + flag セット
// - 'auto': 将来的な自動トリガー (現在未使用、復活時の拡張点)
//   See: docs/specs/architecture.md, issue #30 Out of Scope
export type ScrapeTriggerSource = 'web' | 'auto'

// 対応ストア。Background の STORE_REGISTRY および
// triggerScrapeMessageSchema (shared) と同期させる。
export type ScrapeStore = 'kindle'
