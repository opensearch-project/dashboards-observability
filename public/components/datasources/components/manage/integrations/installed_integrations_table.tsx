/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiButton,
  EuiFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiIcon,
  EuiInMemoryTable,
  EuiLink,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import escapeRegExp from 'lodash/escapeRegExp';
import React, { CSSProperties, useEffect, useState } from 'react';
import { INTEGRATIONS_BASE } from '../../../../../../common/constants/shared';
import { DatasourceType } from '../../../../../../common/types/data_connections';
import { basePathLink } from '../../../../../../common/utils/shared';
import { coreRefs } from '../../../../../framework/core_refs';
import { IntegrationHealthBadge } from '../../../../integrations/components/added_integration';
import { AvailableIntegrationsList } from '../../../../integrations/components/available_integration_overview_page';
import { AvailableIntegrationsTable } from '../../../../integrations/components/available_integration_table';
import { SetupIntegrationForm } from '../../../../integrations/components/setup_integration';
import { isS3Connection } from '../../../utils/helpers';

interface IntegrationInstanceTableEntry {
  id: string;
  name: string;
  locator: {
    name: string;
    id: string;
  };
  status: string;
  assets: number;
}

const labelFromDataSourceType = (dsType: DatasourceType): string | null => {
  switch (dsType) {
    case 'SECURITYLAKE':
      return 'Amazon Security Lake';
    case 'S3GLUE':
      return 'S3 Glue';
    case 'PROMETHEUS':
      return null; // TODO Prometheus integrations not supported so no label available
    default:
      console.error(`Unknown Data Source Type: ${dsType}`);
      return null;
  }
};

const INSTALLED_INTEGRATIONS_COLUMNS = [
  {
    field: 'locator',
    name: 'Instance Name',
    render: (locator: { name: string; id: string }) => {
      return (
        <EuiLink
          data-test-subj={`${locator.name}IntegrationLink`}
          href={basePathLink(`/app/integrations#/installed/${locator.id}`)}
        >
          {locator.name}
        </EuiLink>
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
    id: instance.id,
    name: instance.name,
    locator: { name: instance.name, id: instance.id },
    status: instance.status,
    assets: (instance.assets ?? []).length,
  };
};

const AddIntegrationButton = ({
  toggleFlyout,
  fill,
}: {
  fill?: boolean;
  toggleFlyout: () => void;
}) => {
  return (
    <EuiButton fill={fill} onClick={toggleFlyout}>
      Add Integrations
    </EuiButton>
  );
};

const NoInstalledIntegrations = ({ toggleFlyout }: { toggleFlyout: () => void }) => {
  return (
    <EuiFlexGroup direction="column" alignItems="center" gutterSize="xs">
      <EuiFlexItem grow={false}>
        <EuiIcon type="iInCircle" glyphName="iInCircle" size="xxl" />
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiText textAlign="center">
          {/* Default margin is too wide -- compress it a bit */}
          <p style={{ 'margin-bottom': '8px' } as CSSProperties}>
            <b>There are no installed Integrations</b>
            <br />
            Add integrations to get started.
          </p>
        </EuiText>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <AddIntegrationButton toggleFlyout={toggleFlyout} />
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

export interface InstallIntegrationFlyoutProps {
  datasourceType: DatasourceType;
  datasourceName: string;
  closeFlyout: () => void;
  refreshInstances?: () => void;
}

export const InstallIntegrationFlyout = ({
  datasourceType,
  datasourceName,
  closeFlyout,
  refreshInstances,
}: InstallIntegrationFlyoutProps) => {
  const [availableIntegrations, setAvailableIntegrations] = useState({
    hits: [],
  } as AvailableIntegrationsList);

  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    if (!coreRefs.http) {
      return;
    }
    coreRefs.http.get(`${INTEGRATIONS_BASE}/repository`).then((exists) => {
      setAvailableIntegrations(exists.data);
    });
  }, []);

  const integrationLabelToCheck =
    datasourceType === 'SECURITYLAKE' ? 'Security Lake' : labelFromDataSourceType(datasourceType);

  const integrationsFilteredByLabel = {
    hits: availableIntegrations.hits.filter((config) =>
      config.labels?.includes(integrationLabelToCheck ?? '')
    ),
  };

  const [installingIntegration, setInstallingIntegration] = useState<string | null>(null);
  const maybeCloseFlyout = () => {
    if (!isInstalling) {
      closeFlyout();
    }
  };

  return (
    <EuiFlyout onClose={maybeCloseFlyout} hideCloseButton={isInstalling}>
      {installingIntegration === null ? (
        <AvailableIntegrationsTable
          loading={false}
          data={integrationsFilteredByLabel}
          isCardView={true}
          setInstallingIntegration={setInstallingIntegration}
        />
      ) : (
        <SetupIntegrationForm
          integration={installingIntegration}
          unsetIntegration={() => setInstallingIntegration(null)}
          renderType="flyout"
          forceConnection={
            isS3Connection(datasourceType)
              ? {
                  name: datasourceName,
                  type: datasourceType.toLowerCase() === 'securitylake' ? 'securityLake' : 's3',
                }
              : undefined
          }
          setIsInstalling={(installing: boolean, success?: boolean) => {
            setIsInstalling(installing);
            if (success) {
              closeFlyout();
              refreshInstances?.();
            }
          }}
        />
      )}
    </EuiFlyout>
  );
};

export const InstalledIntegrationsTable = ({
  integrations,
  datasourceType,
  datasourceName,
  refreshInstances,
}: {
  integrations: IntegrationInstanceResult[];
  datasourceType: DatasourceType;
  datasourceName: string;
  refreshInstances: () => void;
}) => {
  const [query, setQuery] = useState('');
  const filteredIntegrations = integrations
    .map(instanceToTableEntry)
    .filter((i) => i.name.match(new RegExp(escapeRegExp(query), 'i')));

  const [showAvailableFlyout, setShowAvailableFlyout] = useState(false);
  const toggleFlyout = () => setShowAvailableFlyout((prev) => !prev);

  const integrationsTable = (
    <>
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
        <EuiFlexItem grow={false}>
          <AddIntegrationButton fill={true} toggleFlyout={toggleFlyout} />
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer />
      <EuiInMemoryTable items={filteredIntegrations} columns={INSTALLED_INTEGRATIONS_COLUMNS} />
    </>
  );

  return (
    <>
      <EuiSpacer />
      <EuiPanel>
        {integrations.length > 0 ? (
          integrationsTable
        ) : (
          <NoInstalledIntegrations toggleFlyout={toggleFlyout} />
        )}
      </EuiPanel>
      {showAvailableFlyout ? (
        <InstallIntegrationFlyout
          closeFlyout={() => setShowAvailableFlyout(false)}
          datasourceType={datasourceType}
          datasourceName={datasourceName}
          refreshInstances={refreshInstances}
        />
      ) : null}
    </>
  );
};
