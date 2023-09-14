/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { EuiPage, EuiPageBody, EuiPageContent } from '@elastic/eui';
import { coreRefs } from '../../../../framework/core_refs';
import { AccelerationHeader } from './acceleration_header';
import { AccelerationManagement } from './management/acceleration_management';

interface AccelerationIndicesProps {
  dataConnection: string;
}

export const AccelerationIndices = ({ dataConnection }: AccelerationIndicesProps) => {
  useEffect(() => {
    coreRefs.chrome?.setBreadcrumbs([
      {
        text: 'Data Connections',
        href: '#/',
      },
      {
        text: 'Acceleration',
        href: '#/manage/acceleration/' + { dataConnection },
      },
    ]);
  }, [dataConnection]);
  return (
    <EuiPage>
      <EuiPageBody component="div">
        <AccelerationHeader />
        <EuiPageContent data-test-subj="manage-acceleration-indices">
          <AccelerationManagement />
        </EuiPageContent>
      </EuiPageBody>
    </EuiPage>
  );
};
