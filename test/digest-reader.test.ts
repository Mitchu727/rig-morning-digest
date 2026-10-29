import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readNight } from '../src/digest/readNight.js';

const fixtureRunsDir = fileURLToPath(new URL('../runs', import.meta.url));
const temporaryDirectories: string[] = [];

function createRunsDir(): string {
  const directory = mkdtempSync(join(tmpdir(), 'rig-digest-reader-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('readNight', () => {
  it('aggregates the fixture into sorted job rows and counts its malformed line', () => {
    const result = readNight(fixtureRunsDir, '2026-10-28');

    expect(result).toEqual({
      malformedLines: 1,
      rows: [
        {
          job: 'digest/render',
          owner: null,
          runs: 1,
          retries: 0,
          lastStatus: 'ok',
          lastError: null,
          firstAt: '2026-10-29T05:41:09+01:00',
          lastAt: '2026-10-29T05:41:09+01:00',
        },
        {
          job: 'fixtures/refresh',
          owner: 'rook',
          runs: 4,
          retries: 3,
          lastStatus: 'ok',
          lastError: null,
          firstAt: '2026-10-29T01:30:00+01:00',
          lastAt: '2026-10-29T01:37:00+01:00',
        },
        {
          job: 'lane/sync',
          owner: 'rook',
          runs: 8,
          retries: 1,
          lastStatus: 'ok',
          lastError: null,
          firstAt: '2026-10-28T23:00:06+01:00',
          lastAt: '2026-10-29T05:00:04+01:00',
        },
        {
          job: 'notes/backup',
          owner: 'lane-07',
          runs: 1,
          retries: 0,
          lastStatus: 'fail',
          lastError: 'quota exceeded',
          firstAt: '2026-10-29T04:00:01+01:00',
          lastAt: '2026-10-29T04:00:01+01:00',
        },
        {
          job: 'rig/rotate-logs',
          owner: 'lane-07',
          runs: 1,
          retries: 0,
          lastStatus: 'ok',
          lastError: null,
          firstAt: '2026-10-28T23:00:02+01:00',
          lastAt: '2026-10-28T23:00:02+01:00',
        },
      ],
    });
  });

  it('uses file order, preserves null owners and timestamps, and counts malformed events', () => {
    const runsDir = createRunsDir();
    const night = '2026-10-28';
    const lines = [
      JSON.stringify({
        at: '2026-10-28T08:00:00+02:00',
        job: 'job/a',
        status: 'retry',
        owner: null,
        error: 'temporary',
      }),
      'not JSON',
      JSON.stringify({
        at: '2026-10-28T07:00:00-04:00',
        job: 'job/a',
        status: 'fail',
        owner: null,
        error: 'last error',
      }),
      JSON.stringify({
        at: '2026-10-28T06:00:00Z',
        job: 'job/b',
        status: 'success',
        owner: 'rook',
      }),
    ];
    writeFileSync(join(runsDir, `${night}.jsonl`), `${lines.join('\n')}\n`);

    const result = readNight(runsDir, night);

    expect(result).toEqual({
      malformedLines: 2,
      rows: [
        {
          job: 'job/a',
          owner: null,
          runs: 2,
          retries: 1,
          lastStatus: 'fail',
          lastError: 'last error',
          firstAt: '2026-10-28T08:00:00+02:00',
          lastAt: '2026-10-28T07:00:00-04:00',
        },
      ],
    });
  });

  it('returns no rows for an empty file and propagates missing-file errors', () => {
    const runsDir = createRunsDir();
    writeFileSync(join(runsDir, 'empty.jsonl'), '');

    expect(readNight(runsDir, 'empty')).toEqual({ rows: [], malformedLines: 0 });

    let missingFileError: unknown;
    try {
      readNight(runsDir, 'missing');
    } catch (error) {
      missingFileError = error;
    }
    expect(missingFileError).toMatchObject({ code: 'ENOENT' });
  });

  it('rejects a night path that escapes the runs directory', () => {
    const runsDir = createRunsDir();
    expect(() => readNight(runsDir, '../outside')).toThrow(/outside the runs directory/);
  });
});
