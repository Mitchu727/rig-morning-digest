import { readdirSync } from 'node:fs';
import type { RigConfig } from './config.js';
import { readNight } from './digest/readNight.js';
import type { DigestRow, DigestStatus } from './digest/types.js';
import { lastBeat, type Beat } from './heartbeat.js';

export type NightDigestCounts = Record<DigestStatus, number>;

export type NightSummary = {
  night: string;
  counts: NightDigestCounts;
};

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: NightSummary[];
};

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

function countLastStatuses(rows: readonly DigestRow[]): NightDigestCounts {
  const counts: NightDigestCounts = { ok: 0, retry: 0, fail: 0 };

  for (const row of rows) {
    counts[row.lastStatus] += 1;
  }

  return counts;
}

export function readStatus(config: RigConfig): Status {
  const nights = nightsOnDisk(config.runsDir).map((night) => ({
    night,
    counts: countLastStatuses(readNight(config.runsDir, night).rows),
  }));

  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights,
  };
}
