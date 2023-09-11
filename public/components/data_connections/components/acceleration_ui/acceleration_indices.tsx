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
  dataSource: string;
}

export const AccelerationIndices = ({ dataSource }: AccelerationIndicesProps) => {
  useEffect(() => {
    coreRefs.chrome?.setBreadcrumbs([
      {
        text: 'Datasources',
        href: '#/',
      },
      {
        text: 'Acceleration',
        href: '#/manage/acceleration/' + { dataSource },
      },
    ]);
  }, [dataSource]);
  return (
    <EuiPage>
      <EuiPageBody component="div">
        <AccelerationHeader />
        <EuiPageContent data-test-subj="manageAccelerationIndices">
          <AccelerationManagement />
        </EuiPageContent>
      </EuiPageBody>
    </EuiPage>
  );
};
