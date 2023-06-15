/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiButton, EuiButtonGroup, EuiSuperSelect } from '@elastic/eui';

export const SqlSelectRow = ({ colRaw }) => {
  return (
    <EuiFlexGroup gutterSize="s" justifyContent="flexStart" alignItems="flexStart">
      <EuiFlexItem key="queryHeader__search-run" className="queryHeader__search-run" grow={false}>
        <EuiSuperSelect options={colOptions} valueOfSelected={} />
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
