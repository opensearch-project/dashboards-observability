/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/** Value formatters of the Infrastructure tab. */

export const formatBytes = (v?: number) => {
  if (v === undefined || Number.isNaN(v)) return '-';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let i = 0;
  let n = v;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(n >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
};

export const formatCores = (v?: number) =>
  v === undefined || Number.isNaN(v) ? '-' : v < 1 ? `${Math.round(v * 1000)}m` : v.toFixed(2);

export const formatCount = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

export const formatRatio = (v: number) => `${(v * 100).toFixed(1)}%`;

export const formatRate = (v: number) => `${formatBytes(v)}/s`;

/** A number with enough precision for small values (0.0042, not 0.0). */
export const formatNumber = (v: number) =>
  Number.isNaN(v)
    ? '-'
    : Math.abs(v) >= 100 || Number.isInteger(v)
      ? Math.round(v).toLocaleString()
      : Number(v.toPrecision(3)).toString();

export const formatLoad = (v: number) => v.toFixed(2);

export const formatPerSecond = (v: number) => `${v.toFixed(2)}/s`;

/** Value format for a metric without a curated chart, from its name and type. */
export const genericFormat = (metric: string, counter: boolean): ((v: number) => string) => {
  if (/_bytes(_total)?$/.test(metric)) return counter ? formatRate : formatBytes;
  // CPU time rated, or a CPU usage gauge, is in cores.
  if (/cpu.*(_seconds_total|_usage)$/.test(metric)) return formatCores;
  return counter ? (v) => `${formatNumber(v)}/s` : formatNumber;
};
