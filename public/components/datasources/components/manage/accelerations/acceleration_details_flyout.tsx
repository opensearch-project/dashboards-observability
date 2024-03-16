/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiIcon,
  EuiSpacer,
  EuiTab,
  EuiTabs,
  EuiText,
} from '@elastic/eui';
import React, { useEffect, useState } from 'react';
import { AccelerationDetailsTab } from './flyout_modules/acceleration_details_tab';
import { AccelerationSchemaTab } from './flyout_modules/accelerations_schema_tab';
import { AccelerationSqlTab } from './flyout_modules/acceleration_sql_tab';
import {
  getRefreshButtonIcon,
  onRefreshButtonClick,
  onDiscoverButtonClick,
  onDeleteButtonClick,
} from './utils/acceleration_utils';
import { coreRefs } from '../../../../../framework/core_refs';
import { OpenSearchDashboardsResponse } from '../../../../../../../../src/core/server/http/router';
import { CachedAcceleration } from '../../../../../../common/types/data_connections';

export interface AccelerationDetailsFlyoutProps {
  index: string;
  acceleration: CachedAcceleration;
  dataSourceName: string;
  resetFlyout: () => void;
}

const getMappings = (index: string): Promise<OpenSearchDashboardsResponse> | undefined => {
  return coreRefs.dslService?.fetchFields(index);
};

const getSettings = (index: string): Promise<OpenSearchDashboardsResponse> | undefined => {
  return coreRefs.dslService?.fetchSettings(index);
};

const getIndexInfo = (index: string): Promise<OpenSearchDashboardsResponse> | undefined => {
  return coreRefs.dslService?.fetchIndices(index);
};

const handleDetailsFetchingPromise = (
  promise: Promise<OpenSearchDashboardsResponse> | undefined,
  action: string
) => {
  return promise!
    .then((data) => ({ status: 'fulfilled', action, data }))
    .catch((error) => ({ status: 'rejected', action, error }));
};

export const AccelerationDetailsFlyout = (props: AccelerationDetailsFlyoutProps) => {
  const { index, dataSourceName, acceleration, resetFlyout } = props;
  console.log(index, acceleration, dataSourceName);
  const { flintIndexName } = acceleration;
  const [selectedTab, setSelectedTab] = useState('details');
  const tabsMap: { [key: string]: any } = {
    details: AccelerationDetailsTab,
    schema: AccelerationSchemaTab,
    sql_definition: AccelerationSqlTab,
  };
  const [settings, setSettings] = useState<object>();
  const [mappings, setMappings] = useState();
  const [indexInfo, setIndexInfo] = useState();

  const updateMapping = (result) => {
    setMappings(result);
  };

  const updateSetting = (result, slectedIndex: string) => {
    setSettings(result.data[slectedIndex]);
  };

  const updateIndexInfo = (result) => {
    setIndexInfo(result);
  };

  const getAccDetail = (selectedIndex: string) => {
    Promise.all([
      handleDetailsFetchingPromise(getMappings(selectedIndex), 'getMappings'),
      handleDetailsFetchingPromise(getSettings(selectedIndex), 'getSettings'),
      handleDetailsFetchingPromise(getIndexInfo(selectedIndex), 'getIndexInfo'),
    ])
      .then((results) => {
        updateMapping(results[0]);
        updateSetting(results[1], selectedIndex);
        updateIndexInfo(results[2]);
      })
      .catch((errors: Error[]) => {
        errors.forEach((error, errorIndex) => {
          console.error(`Error in async call ${errorIndex + 1}:`, error);
        });
      });
  };

  useEffect(() => {
    if (flintIndexName !== undefined && flintIndexName.trim().length > 0) {
      getAccDetail(flintIndexName);
    }
  }, [flintIndexName]);

  const DiscoverButton = () => {
    // TODO: display button if can be sent to discover
    return (
      <EuiButtonEmpty
        onClick={() => {
          onDiscoverButtonClick(acceleration, dataSourceName);
          resetFlyout();
        }}
      >
        <EuiIcon type={'discoverApp'} size="m" />
      </EuiButtonEmpty>
    );
  };

  const RefreshButton = () => {
    return (
      <EuiButtonEmpty onClick={onRefreshButtonClick}>
        <EuiIcon type={getRefreshButtonIcon()} size="m" />
      </EuiButtonEmpty>
    );
  };

  const DeleteButton = () => {
    return (
      <EuiButtonEmpty onClick={onDeleteButtonClick}>
        <EuiIcon type="trash" size="m" />
      </EuiButtonEmpty>
    );
  };

  const accelerationDetailsTabs = [
    {
      id: 'details',
      name: 'Details',
      disabled: false,
    },
    {
      id: 'schema',
      name: 'Schema',
      disabled: false,
    },
    {
      id: 'sql_definition',
      name: 'SQL Definition',
      disabled: false,
    },
  ];

  const renderTabs = () => {
    return accelerationDetailsTabs.map((tab, tabIndex) => {
      return (
        <EuiTab
          onClick={() => setSelectedTab(tab.id)}
          isSelected={tab.id === selectedTab}
          disabled={tab.disabled}
          key={tabIndex}
        >
          {tab.name}
        </EuiTab>
      );
    });
  };

  const renderTabContent = (tab: string) => {
    let propsForTab;

    switch (tab) {
      case 'details':
        propsForTab = { acceleration, settings, mappings, indexInfo, dataSourceName };
        break;
      case 'schema':
        propsForTab = { mappings, indexInfo };
        break;
      case 'sql_definition':
        propsForTab = { mappings };
        break;
      default:
        console.log('Unknown Tab: ', tab);
        return null;
    }

    const TabToDisplay = tabsMap[tab];

    return <TabToDisplay {...propsForTab} />;
  };

  return (
    <>
      <EuiFlyoutHeader hasBorder>
        <EuiFlexGroup direction="row" alignItems="center" gutterSize="m">
          <EuiFlexItem>
            <EuiText>
              <h2 className="panel-title">{index}</h2>
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <DiscoverButton />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <RefreshButton />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <DeleteButton />
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="m" />
        <EuiTabs style={{ marginBottom: '-25px' }}>{renderTabs()}</EuiTabs>
      </EuiFlyoutHeader>
      <EuiFlyoutBody>{renderTabContent(selectedTab)}</EuiFlyoutBody>
    </>
  );
};
