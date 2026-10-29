import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { createApp } from '../src/app.js';

const night = '2026-10-28';
const outputArgument = process.argv[2];

if (!outputArgument) {
  throw new Error('Usage: pnpm run preview:render <output-file>');
}

const repositoryRoot = resolve('.');
const outputPath = resolve(outputArgument);
const outputRelativeToRepository = resolve(repositoryRoot, outputPath);
if (
  outputRelativeToRepository === repositoryRoot ||
  outputRelativeToRepository.startsWith(`${repositoryRoot}${sep}`)
) {
  throw new Error('Preview output must be outside the repository.');
}

const response = await createApp().request(`/digest/${night}`);
if (response.status !== 200) {
  throw new Error(`Could not render digest ${night}: HTTP ${response.status}.`);
}

const contentType = response.headers.get('content-type') ?? '';
if (!contentType.toLowerCase().startsWith('text/html')) {
  throw new Error(`Expected HTML for digest ${night}; received ${contentType || 'no content type'}.`);
}

const html = await response.text();
if (!html.startsWith('<!doctype html>')) {
  throw new Error('Rendered page is missing its HTML doctype.');
}
if (/<script\b/i.test(html) || /(?:src|href)\s*=\s*["']https?:\/\//i.test(html)) {
  throw new Error('Preview must remain self-contained with no client scripts or remote assets.');
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, html, 'utf8');

const markerStatus = process.env.LANE_MARKER?.trim() ? 'included' : 'unset';
console.log(`Rendered ${night} preview (${markerStatus}; ${Buffer.byteLength(html)} bytes).`);
