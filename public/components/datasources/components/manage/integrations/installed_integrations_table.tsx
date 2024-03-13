/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EuiSpacer, EuiPanel, EuiHorizontalRule, EuiInMemoryTable } from '@elastic/eui';
import { IntegrationHealthBadge } from '../../../../integrations/components/added_integration';

interface IntegrationInstanceTableEntry {
  name: string;
  status: string;
//   status: React.JSX.Element;
  assets: number;
}

const INSTALLED_INTEGRATIONS_COLUMNS = [
  { field: 'name', name: 'Instance Name' },
  { field: 'status', name: 'Status' },
  { field: 'assets', name: 'Asset Count' },
];

const instanceToTableEntry = (
  instance: IntegrationInstanceResult
): IntegrationInstanceTableEntry => {
  return {
    name: instance.name,
    status: instance.status,
    // status: <IntegrationHealthBadge status={instance.status} />,
    assets: instance.assets.length,
  };
};

export const InstalledIntegrationsTable = ({
  integrations,
}: {
  integrations: IntegrationInstanceResult[];
}) => {
  return (
    <>
      <EuiSpacer />
      <EuiPanel>
        <h1>Header</h1>
        <EuiHorizontalRule />
        <EuiSpacer />
        <EuiInMemoryTable
          items={integrations.map(instanceToTableEntry)}
          columns={INSTALLED_INTEGRATIONS_COLUMNS}
        />
      </EuiPanel>
    </>
  );
};
