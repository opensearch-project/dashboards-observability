/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiButton, EuiText } from '@elastic/eui';
import React from 'react';

interface Props {
  showModal: () => void;
}

export function AddDashboardCallout({ showModal }: Props) {
  return (
    <>
      <EuiText>
        <p>Please select your observability overview dashboard.</p>
      </EuiText>
      <EuiButton onClick={showModal}>Add</EuiButton>
    </>
  );
}
