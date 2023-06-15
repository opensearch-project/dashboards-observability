/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiButton, EuiButtonGroup } from '@elastic/eui';
import { SqlSelectRow } from './sql_select_row';

export const SqlVisualBuilder = (props) => {
  return (
    <EuiFlexGroup gutterSize="s" justifyContent="flexStart" alignItems="flexStart">
      <EuiFlexItem key="queryHeader__search-run" className="queryHeader__search-run">
        <SqlSelectRow options={props.options} />
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
