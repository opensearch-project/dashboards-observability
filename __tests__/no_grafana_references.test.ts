/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * W1.12 — no-grafana guard.
 *
 * The observability plugin ships a Prometheus-compatible SLO/alerting UX; we
 * do not integrate with (nor reference) Grafana. This test fails if any file
 * under `public/`, `server/`, `common/`, or `docs/` mentions "grafana"
 * (case-insensitive) so reviewers don't have to catch strays by eye.
 *
 * The test file itself is (by design) the only place the word may appear in
 * this plugin — it is explicitly excluded from the scan.
 */

import * as fs from 'fs';
import * as path from 'path';

interface Offender {
  file: string;
  line: number;
  snippet: string;
}

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const SCAN_ROOTS = ['public', 'server', 'common', 'docs'];

const TEXT_EXTENSIONS = new Set<string>([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.md',
  '.yaml',
  '.yml',
  '.json',
  '.scss',
  '.css',
  '.html',
]);

const EXCLUDED_DIR_NAMES = new Set<string>([
  'node_modules',
  'target',
  'build',
  'dist',
  '.git',
  'screenshots',
  'videos',
]);

const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB defensive cap
const SELF_FILENAME = 'no_grafana_references.test.ts';
const PATTERN = /grafana/i;
const SNIPPET_CONTEXT = 40;

const isCypressMediaDir = (absPath: string): boolean => {
  const normalized = absPath.replace(/\\/g, '/');
  return (
    normalized.includes('/.cypress/screenshots') ||
    normalized.includes('/.cypress/videos') ||
    normalized.includes('/cypress/screenshots') ||
    normalized.includes('/cypress/videos')
  );
};

const walk = (dir: string, acc: string[]): void => {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIR_NAMES.has(entry.name)) continue;
      if (isCypressMediaDir(full)) continue;
      walk(full, acc);
      continue;
    }
    if (!entry.isFile()) continue;
    if (entry.name === SELF_FILENAME) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!TEXT_EXTENSIONS.has(ext)) continue;
    acc.push(full);
  }
};

const scanFile = (absPath: string): Offender[] => {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(absPath);
  } catch {
    return [];
  }
  if (stat.size > MAX_FILE_BYTES) return [];

  let content: string;
  try {
    content = fs.readFileSync(absPath, 'utf8');
  } catch {
    return [];
  }

  const results: Offender[] = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const match = PATTERN.exec(line);
    if (!match) continue;
    const idx = match.index;
    const start = Math.max(0, idx - SNIPPET_CONTEXT);
    const end = Math.min(line.length, idx + match[0].length + SNIPPET_CONTEXT);
    const snippet = line.slice(start, end).trim();
    results.push({
      file: path.relative(PLUGIN_ROOT, absPath),
      line: i + 1,
      snippet,
    });
  }
  return results;
};

const scanForGrafana = (roots: string[]): Offender[] => {
  const offenders: Offender[] = [];
  const files: string[] = [];
  for (const root of roots) {
    const full = path.join(PLUGIN_ROOT, root);
    if (!fs.existsSync(full)) continue; // docs/ may be absent
    walk(full, files);
  }
  for (const file of files) {
    offenders.push(...scanFile(file));
  }
  return offenders;
};

describe('no Grafana references (W1.12)', () => {
  it('codebase contains no case-insensitive references under public/, server/, common/, docs/', () => {
    const offenders = scanForGrafana(SCAN_ROOTS);
    if (offenders.length > 0) {
      const msg = offenders.map((o) => `${o.file}:${o.line} — ${o.snippet}`).join('\n');
      throw new Error(
        `Found ${offenders.length} forbidden reference(s):\n${msg}\n\n` +
          `Use "external dashboards", "visualizations", or "Prometheus-compatible tools" instead.`
      );
    }
    expect(offenders).toHaveLength(0);
  });
});
