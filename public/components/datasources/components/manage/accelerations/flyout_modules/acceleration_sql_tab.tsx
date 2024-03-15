/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiCodeBlock, EuiSpacer } from '@elastic/eui';
import React from 'react';

interface AccelerationSqlTabProps {
  mappings: any;
}

export const AccelerationSqlTab = (props: AccelerationSqlTabProps) => {
  const { mappings } = props;
  // TODO: Retrieve SQL query from backend
  console.log(mappings);

  return (
    <>
      <EuiSpacer />
      <EuiCodeBlock language="sql" isCopyable>
        Placeholder
      </EuiCodeBlock>
    </>
  );
};
