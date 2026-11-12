/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';

/**
 * Every EuiButtonGroup in APM fills its selected option with the primary color,
 * not OUI's dark-gray default (`color="text"`), so the toggles (latency
 * percentile, Top K, map focus mode, layouts, SLO windows) look the same.
 */
const APM_ROOT = path.resolve(__dirname, '..');

const sourceFiles = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(full);
    return /\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name) ? [full] : [];
  });

/** The props of each `<EuiButtonGroup ...>` opening tag in a file. */
const buttonGroupProps = (source: string): string[] => {
  const groups: string[] = [];
  const re = /<EuiButtonGroup\b([\s\S]*?)\/>/g;
  let match = re.exec(source);
  while (match) {
    groups.push(match[1]);
    match = re.exec(source);
  }
  return groups;
};

describe('APM button groups', () => {
  const groups = sourceFiles(APM_ROOT).flatMap((file) =>
    buttonGroupProps(fs.readFileSync(file, 'utf8')).map((props) => ({
      file: path.relative(APM_ROOT, file),
      props,
    }))
  );

  it('finds the APM toggles', () => {
    expect(groups.length).toBeGreaterThanOrEqual(10);
  });

  it('sets color="primary" on every EuiButtonGroup', () => {
    const missing = groups.filter((g) => !/\bcolor="primary"/.test(g.props)).map((g) => g.file);
    expect(missing).toEqual([]);
  });
});
