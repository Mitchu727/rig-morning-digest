import { readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { DigestRow, DigestStatus, ReadNight, ReadNightResult } from './types.js';

type RunEvent = {
  at: string;
  job: string;
  status: DigestStatus;
  owner: string | null;
  error?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDigestStatus(value: unknown): value is DigestStatus {
  return value === 'ok' || value === 'retry' || value === 'fail';
}

function parseEvent(line: string): RunEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }

  if (!isRecord(value)) return null;
  if (typeof value.at !== 'string' || typeof value.job !== 'string') return null;
  if (!isDigestStatus(value.status)) return null;
  if (value.owner !== null && typeof value.owner !== 'string') return null;
  if (Object.hasOwn(value, 'error') && typeof value.error !== 'string') return null;

  return {
    at: value.at,
    job: value.job,
    status: value.status,
    owner: value.owner,
    ...(typeof value.error === 'string' ? { error: value.error } : {}),
  };
}

function isWithinDirectory(directory: string, candidate: string): boolean {
  const pathFromDirectory = relative(directory, candidate);
  return (
    pathFromDirectory !== '' &&
    pathFromDirectory !== '..' &&
    !pathFromDirectory.startsWith(`..${sep}`) &&
    !isAbsolute(pathFromDirectory)
  );
}

function resolveNightFile(runsDir: string, night: string): string {
  const realRunsDir = realpathSync(runsDir);
  const requestedFile = resolve(realRunsDir, `${night}.jsonl`);

  if (!isWithinDirectory(realRunsDir, requestedFile)) {
    throw new RangeError(`Night "${night}" resolves outside the runs directory`);
  }

  const realFile = realpathSync(requestedFile);
  if (!isWithinDirectory(realRunsDir, realFile)) {
    throw new RangeError(`Night "${night}" resolves outside the runs directory`);
  }

  return realFile;
}

export const readNight: ReadNight = (runsDir, night): ReadNightResult => {
  const file = resolveNightFile(runsDir, night);
  const contents = readFileSync(file, 'utf8');
  if (contents === '') return { rows: [], malformedLines: 0 };

  const lines = contents.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();

  const rowsByJob = new Map<string, DigestRow>();
  let malformedLines = 0;

  for (const line of lines) {
    const event = parseEvent(line);
    if (!event) {
      malformedLines += 1;
      continue;
    }

    const row = rowsByJob.get(event.job);
    if (!row) {
      rowsByJob.set(event.job, {
        job: event.job,
        owner: event.owner,
        runs: 1,
        retries: event.status === 'retry' ? 1 : 0,
        lastStatus: event.status,
        lastError: event.error ?? null,
        firstAt: event.at,
        lastAt: event.at,
      });
      continue;
    }

    row.runs += 1;
    if (event.status === 'retry') row.retries += 1;
    row.lastStatus = event.status;
    row.lastError = event.error ?? null;
    row.lastAt = event.at;
  }

  const rows = [...rowsByJob.values()].sort((left, right) =>
    left.job < right.job ? -1 : left.job > right.job ? 1 : 0,
  );

  return { rows, malformedLines };
};
