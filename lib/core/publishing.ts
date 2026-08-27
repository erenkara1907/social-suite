/**
 * ← siraya/lib/publishing.ts
 * Uyarlama: `Platform` tipi `lib/core/types`'tan; gövde aynen korundu.
 *
 * Platforms the product can actually publish to today. Everything else can
 * still be drafted — but scheduling it would be a promise the scheduler cannot
 * keep, so the queue would sit there looking fine while nothing ever went out.
 *
 * Genişletme noktası: §8.8 (Instagram dışı platform yayıncıları).
 */
import type { Platform } from "@/lib/core/types";

export const PUBLISHABLE_PLATFORMS: Platform[] = ["instagram"];

export function canPublish(platform: Platform): boolean {
  return PUBLISHABLE_PLATFORMS.includes(platform);
}

/** Statuses that mean "this is expected to go out on its own". */
export const AUTOMATED_STATUSES = ["scheduled", "published"] as const;
