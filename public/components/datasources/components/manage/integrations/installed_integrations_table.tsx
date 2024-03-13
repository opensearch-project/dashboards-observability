/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  EuiSpacer,
  EuiPanel,
  EuiHorizontalRule,
  EuiInMemoryTable,
  EuiTitle,
  OuiLink,
} from '@elastic/eui';
import { IntegrationHealthBadge } from '../../../../integrations/components/added_integration';

interface IntegrationInstanceTableEntry {
  locator: {
    name: string;
    id: string;
  };
  status: string;
  assets: number;
}

const INSTALLED_INTEGRATIONS_COLUMNS = [
  {
    field: 'locator',
    name: 'Instance Name',
    render: (locator: { name: string; id: string }) => {
      return (
        <OuiLink
          data-test-subj={`${locator.name}IntegrationLink`}
          href={`/app/integrations#/installed/${locator.id}`}
        >
          {locator.name}
        </OuiLink>
      );
    },
  },
  {
    field: 'status',
    name: 'Status',
    render: (status: string) => {
      return <IntegrationHealthBadge status={status} />;
    },
  },
  { field: 'assets', name: 'Asset Count' },
];

const instanceToTableEntry = (
  instance: IntegrationInstanceResult
): IntegrationInstanceTableEntry => {
  return {
    locator: { name: instance.name, id: instance.id },
    status: instance.status,
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
        <EuiTitle>
          <h2>Installed Integrations</h2>
        </EuiTitle>
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
