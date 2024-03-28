/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, CSSProperties, useEffect } from 'react';
import {
  EuiSpacer,
  EuiPanel,
  EuiInMemoryTable,
  EuiTitle,
  EuiLink,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFieldSearch,
  EuiButton,
  EuiIcon,
  EuiText,
  EuiFlyout,
} from '@elastic/eui';
import _ from 'lodash';
import { IntegrationHealthBadge } from '../../../../integrations/components/added_integration';
import { SetupIntegrationForm } from '../../../../integrations/components/setup_integration';
import { coreRefs } from '../../../../../framework/core_refs';
import { basePathLink } from '../../../../../../common/utils/shared';
import { AvailableIntegrationsTable } from '../../../../integrations/components/available_integration_table';
import { INTEGRATIONS_BASE } from '../../../../../../common/constants/shared';
import { AvailableIntegrationsList } from '../../../../integrations/components/available_integration_overview_page';
import { DatasourceType } from '../../../../../../common/types/data_connections';

interface IntegrationInstanceTableEntry {
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
    case 'S3GLUE':
      return 'Flint S3';
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

export const InstallIntegrationFlyout = ({
  closeFlyout,
  datasourceType,
  datasourceName,
  refreshInstances,
}: {
  closeFlyout: () => void;
  datasourceType: DatasourceType;
  datasourceName: string;
  refreshInstances: () => void;
}) => {
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

  const s3FilteredIntegrations = {
    hits: availableIntegrations.hits.filter((config) =>
      config.labels?.includes(labelFromDataSourceType(datasourceType) ?? '')
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
          data={s3FilteredIntegrations}
          isCardView={true}
          setInstallingIntegration={setInstallingIntegration}
        />
      ) : (
        <SetupIntegrationForm
          integration={installingIntegration}
          unsetIntegration={() => setInstallingIntegration(null)}
          renderType="flyout"
          forceConnection={
            datasourceType === 'S3GLUE'
              ? {
                  name: datasourceName,
                  type: 's3',
                }
              : undefined
          }
          setIsInstalling={(installing: boolean, success?: boolean) => {
            setIsInstalling(installing);
            if (success) {
              closeFlyout();
              refreshInstances();
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
    .filter((i) => i.name.match(new RegExp(_.escapeRegExp(query), 'i')));

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
