/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  EuiSpacer,
  EuiPanel,
  EuiInMemoryTable,
  EuiTitle,
  OuiLink,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFieldSearch,
} from '@elastic/eui';
import _ from 'lodash';
import { IntegrationHealthBadge } from '../../../../integrations/components/added_integration';

interface IntegrationInstanceTableEntry {
  name: string;
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
    name: instance.name,
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
  const [query, setQuery] = useState('');
  const filteredIntegrations = integrations
    .map(instanceToTableEntry)
    .filter((i) => i.name.match(new RegExp(_.escapeRegExp(query), 'i')));

  return (
    <>
      <EuiSpacer />
      <EuiPanel>
        <EuiTitle>
          <h2>Installed Integrations</h2>
        </EuiTitle>
        <EuiSpacer />
        <EuiFlexGroup>
          <EuiFlexItem>
            <EuiFieldSearch
              fullWidth
              placeholder="Search..."
              onChange={(queryEvent) => {
                setQuery(queryEvent.target.value);
              }}
            />
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer />
        <EuiInMemoryTable items={filteredIntegrations} columns={INSTALLED_INTEGRATIONS_COLUMNS} />
      </EuiPanel>
    </>
  );
};
