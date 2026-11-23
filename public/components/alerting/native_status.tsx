/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EuiBadge, EuiHealth } from '@elastic/eui';
import { euiThemeVars } from '@osd/ui-shared-deps/theme';

/**
 * Breach tag color: the theme's danger red (#BD271E in the light theme). Not
 * `EuiBadge color="danger"`, which is the chart palette's salmon and reads as
 * orange next to the dots.
 */
export const BREACH_TAG_COLOR = euiThemeVars.euiColorDanger;

export interface NativeStatusProps {
  /** The status in the data source's own word (In alarm, Firing, Active, ...). */
  label: string;
  /** Hover text for the word (defaults to none). */
  title?: string;
  /** Style for the word, e.g. single-line truncation in a resizable column. */
  labelStyle?: React.CSSProperties;
  /** `EuiHealth` color for a status that is not a breach. */
  color: string;
  /** A breached status renders as a filled red tag with no dot. */
  breached: boolean;
  'data-test-subj'?: string;
}

/**
 * One status per row: a breach is a filled red tag with white text; every other status
 * is a dot in its color with the word at normal weight.
 */
export const NativeStatus: React.FC<NativeStatusProps> = ({
  label,
  color,
  breached,
  title,
  labelStyle,
  'data-test-subj': dataTestSubj,
}) => {
  const word =
    title || labelStyle ? (
      <span style={labelStyle} title={title}>
        {label}
      </span>
    ) : (
      label
    );
  return breached ? (
    <EuiBadge color={BREACH_TAG_COLOR} data-test-subj={dataTestSubj} data-breached="true">
      {word}
    </EuiBadge>
  ) : (
    <EuiHealth color={color} data-test-subj={dataTestSubj}>
      {word}
    </EuiHealth>
  );
};
