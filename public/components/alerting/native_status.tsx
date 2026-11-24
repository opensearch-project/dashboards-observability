/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EuiHealth } from '@elastic/eui';
import { euiThemeVars } from '@osd/ui-shared-deps/theme';

/**
 * Breach dot color: the theme's danger red (#BD271E in the light theme), so red means
 * breached for every data source. Not the chart palette's salmon, which reads as orange.
 */
export const BREACH_DOT_COLOR = euiThemeVars.euiColorDanger;

export interface NativeStatusProps {
  /** The status in the data source's own word (In alarm, Firing, Active, ...). */
  label: string;
  /** Hover text for the word (defaults to none). */
  title?: string;
  /** Style for the word, e.g. single-line truncation in a resizable column. */
  labelStyle?: React.CSSProperties;
  /** `EuiHealth` color for a status that is not a breach. */
  color: string;
  /** A breached status gets the red dot; every status is a dot and a word. */
  breached: boolean;
  'data-test-subj'?: string;
}

/**
 * One status per row: a dot and the data source's own word. The dot is red for a
 * breach and the status color otherwise.
 */
export const NativeStatus: React.FC<NativeStatusProps> = ({
  label,
  color,
  breached,
  title,
  labelStyle,
  'data-test-subj': dataTestSubj,
}) => {
  // Every status word is semibold, breached or not.
  const word = (
    <span style={{ fontWeight: 600, ...labelStyle }} title={title}>
      {label}
    </span>
  );
  // Every status is a dot and a word, so it still reads in grayscale. A breach
  // (In alarm, Firing, Active) gets the danger red; `data-breached` marks it for tests.
  return (
    <EuiHealth
      color={breached ? BREACH_DOT_COLOR : color}
      data-test-subj={dataTestSubj}
      data-breached={breached ? 'true' : undefined}
    >
      {word}
    </EuiHealth>
  );
};
