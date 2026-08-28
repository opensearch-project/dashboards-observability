/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Renders an annotation value as a clickable link when it is a safe URL, and
 * as plain text otherwise. Alert/SLO annotations frequently hold runbook URLs;
 * on-call engineers need to click through rather than copy-paste (SRE2).
 *
 * SECURITY: only `http:`/`https:` URLs are linkified. Any other scheme
 * (`javascript:`, `data:`, `file:`, …) — or anything the `URL` constructor
 * rejects — falls back to plain text so we never emit an executable link.
 */

import React from 'react';
import { EuiLink } from '@elastic/eui';

const EM_DASH = '—';

/**
 * True only for absolute `http:`/`https:` URLs. Parsing goes through the `URL`
 * constructor (throws on relative/garbage input) so scheme validation is done
 * on the parsed `protocol`, never on a string prefix.
 */
export function isSafeHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

export interface LinkifyAnnotationProps {
  /** The raw annotation value. */
  value?: string | null;
  /** Rendered when the value is empty/whitespace. Defaults to an em dash. */
  fallback?: string;
  'data-test-subj'?: string;
}

export const LinkifyAnnotation: React.FC<LinkifyAnnotationProps> = ({
  value,
  fallback = EM_DASH,
  'data-test-subj': dataTestSubj,
}) => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) {
    return <span data-test-subj={dataTestSubj}>{fallback}</span>;
  }
  if (isSafeHttpUrl(trimmed)) {
    // External links open in a new tab; `rel="noreferrer"` also implies
    // `noopener`, so the opened runbook can't reach back through `window.opener`.
    return (
      <EuiLink
        href={trimmed}
        target="_blank"
        rel="noreferrer"
        external
        data-test-subj={dataTestSubj}
      >
        {trimmed}
      </EuiLink>
    );
  }
  return <span data-test-subj={dataTestSubj}>{value}</span>;
};
