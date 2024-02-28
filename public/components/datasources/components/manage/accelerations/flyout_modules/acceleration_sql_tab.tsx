/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiCodeBlock, EuiSpacer } from '@elastic/eui';
import React from 'react';

interface AccelerationSqlTabProps {
  acceleration: any;
}

export const AccelerationSqlTab = (props: AccelerationSqlTabProps) => {
  const { acceleration } = props;
  // TODO: Retrieve SQL query from backend
  console.log(acceleration);

  return (
    <>
      <EuiSpacer />
      <EuiCodeBlock language="sql" isCopyable>
        {acceleration.sql}
      </EuiCodeBlock>
    </>
  );
};
