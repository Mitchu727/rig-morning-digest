import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestRow } from '../src/digest/types.js';

let runsDir = '';

beforeEach(async () => {
  runsDir = await mkdtemp(join(tmpdir(), 'rig-digest-routes-'));
});

afterEach(async () => {
  if (runsDir) await rm(runsDir, { recursive: true, force: true });
});

function testApp() {
  return createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  });
}

async function writeNight(night: string, contents: string) {
  await writeFile(join(runsDir, `${night}.jsonl`), contents, 'utf8');
}

async function readDigestRows(response: Response): Promise<DigestRow[]> {
  const body: unknown = JSON.parse(await response.text());
  if (!Array.isArray(body)) {
    throw new Error('Expected the digest API to return an array of rows');
  }
  return body as DigestRow[];
}

function jobsFromHtml(html: string): string[] {
  return Array.from(html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)).flatMap(([, row]) => {
    const firstCell = row.match(/<td\b[^>]*>([\s\S]*?)<\/td>/i)?.[1];
    return firstCell ? [firstCell.replace(/<[^>]*>/g, '').trim()] : [];
  });
}

describe('digest routes', () => {
  it('serves the 2026-10-28 rows in the same sorted order in HTML and JSON', async () => {
    const sample = await readFile(new URL('../runs/2026-10-28.jsonl', import.meta.url), 'utf8');
    await writeNight('2026-10-28', sample);

    const app = testApp();
    const [htmlResponse, jsonResponse] = await Promise.all([
      app.request('/digest/2026-10-28'),
      app.request('/api/digest/2026-10-28'),
    ]);

    expect(htmlResponse.status).toBe(200);
    expect(jsonResponse.status).toBe(200);

    const htmlJobs = jobsFromHtml(await htmlResponse.text());
    const jsonJobs = (await readDigestRows(jsonResponse)).map((row) => row.job);
    const expectedJobs = [
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ];

    expect(jsonJobs).toEqual(expectedJobs);
    expect(htmlJobs).toEqual(jsonJobs);
  });

  it('returns 404 from both routes when the night file is missing', async () => {
    const app = testApp();
    const [htmlResponse, jsonResponse] = await Promise.all([
      app.request('/digest/2026-11-01'),
      app.request('/api/digest/2026-11-01'),
    ]);

    expect(htmlResponse.status).toBe(404);
    expect(jsonResponse.status).toBe(404);
  });

  it('renders an existing empty night and returns an empty JSON array', async () => {
    await writeNight('2026-10-30', '');

    const app = testApp();
    const [htmlResponse, jsonResponse] = await Promise.all([
      app.request('/digest/2026-10-30'),
      app.request('/api/digest/2026-10-30'),
    ]);

    expect(htmlResponse.status).toBe(200);
    expect(await htmlResponse.text()).toContain('nothing ran');
    expect(jsonResponse.status).toBe(200);
    expect(await readDigestRows(jsonResponse)).toEqual([]);
  });

  it('keeps valid rows available when a night contains malformed JSONL', async () => {
    const validLine = JSON.stringify({
      at: '2026-10-31T07:00:00+01:00',
      job: 'nightly/backup',
      status: 'ok',
      owner: null,
    });
    await writeNight('2026-10-31', `${validLine}\n{"at":\n`);

    const app = testApp();
    const [htmlResponse, jsonResponse] = await Promise.all([
      app.request('/digest/2026-10-31'),
      app.request('/api/digest/2026-10-31'),
    ]);

    expect(htmlResponse.status).toBe(200);
    expect(jobsFromHtml(await htmlResponse.text())).toEqual(['nightly/backup']);
    expect(jsonResponse.status).toBe(200);
    expect((await readDigestRows(jsonResponse)).map((row) => row.job)).toEqual([
      'nightly/backup',
    ]);
  });
});
