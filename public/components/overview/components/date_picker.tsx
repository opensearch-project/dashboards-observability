/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiButtonIcon, EuiFlexGroup, EuiFlexItem, EuiSuperDatePicker } from '@elastic/eui';
import React from 'react';

interface Props {
  startDate: string;
  setStartDate: (start: string) => void;
  showModal: () => void;
}

export function DatePicker({ startDate, setStartDate, showModal }: Props) {
  return (
    <EuiFlexGroup gutterSize="s" alignItems="center">
      <EuiFlexItem grow={false}>
        <EuiSuperDatePicker
          start={startDate}
          end={startDate}
          onTimeChange={({ start }) => {
            setStartDate(start);
          }}
        />
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiButtonIcon iconType="gear" aria-label="Dashboard" color="success" onClick={showModal} />
      </EuiFlexItem>
    </EuiFlexGroup>
  );
}
