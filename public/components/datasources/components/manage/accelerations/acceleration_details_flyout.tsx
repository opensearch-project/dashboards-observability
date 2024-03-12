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
} from '../accelerations/helpers/utils';
import { coreRefs } from '../../../../../framework/core_refs';
import { OpenSearchDashboardsResponse } from '../../../../../../../../src/core/server/http/router';

export interface AccelerationDetailsFlyoutProps {
  acceleration: any;
}

const getMappings = (index: string): Promise<OpenSearchDashboardsResponse> | undefined => {
  console.log('getMappings index: ', index);
  return coreRefs.dslService?.fetchFields(index);
};

const getSettings = (index: string): Promise<OpenSearchDashboardsResponse> | undefined => {
  return coreRefs.dslService?.fetchSettings(index);
};

const handlePromise = (
  promise: Promise<OpenSearchDashboardsResponse> | undefined,
  flintIndexName: string
) => {
  return promise!
    .then((data) => ({ status: 'fulfilled', flintIndexName, data }))
    .catch((error) => ({ status: 'rejected', flintIndexName, error }));
};

export const AccelerationDetailsFlyout = ({
  acceleration: selectedAcc,
}: AccelerationDetailsFlyoutProps) => {
  const { index, acceleration } = selectedAcc;
  const { flintIndexName } = acceleration;
  console.log('hahhahhaha flintIndexName: ', flintIndexName);
  // console.log(index);
  // console.log('?????index');
  console.log('acceleration AccelerationDetailsFlyout: ', acceleration);
  // console.log(index);
  const [selectedTab, setSelectedTab] = useState('details');
  const tabsMap: { [key: string]: any } = {
    details: AccelerationDetailsTab,
    schema: AccelerationSchemaTab,
    sql_definition: AccelerationSqlTab,
  };
  // const { dslService } = coreRefs;
  const [settings, setSettings] = useState<object>();
  const [mappings, setMappings] = useState();

  const updateMapping = (result) => {
    console.log('updateMapping: ');
    console.log(result);
    setMappings(result);
  };

  const updateSetting = (result, slectedIndex: string) => {
    console.log('updateSetting: ');
    console.log(result);
    setSettings(result.data[slectedIndex]);
  };

  const getAccDetail = (selectedIndex: string) => {
    console.log('getAccDetail index: ', selectedIndex);
    Promise.all([
      handlePromise(getMappings(selectedIndex), 'getMappings'),
      handlePromise(getSettings(selectedIndex), 'getSettings'),
    ])
      .then((results) => {
        updateMapping(results[0]);
        updateSetting(results[1], selectedIndex);
      })
      .catch((errors: Error[]) => {
        errors.forEach((error, errorIndex) => {
          console.error(`Error in async call ${errorIndex + 1}:`, error);
        });
      });
  };

  useEffect(() => {
    getAccDetail(flintIndexName);
  }, [flintIndexName]);

  const DiscoverButton = () => {
    // TODO: display button if can be sent to discover
    return (
      <EuiButtonEmpty onClick={onDiscoverButtonClick}>
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

  const renderTabContent = (tab: string, tabAcceleration: any) => {
    const { acceleration: acc, settings: sett, mappings: mapp } = tabAcceleration;

    const TabToDisplay = tabsMap[tab];
    console.log('tabAcceleration: ', tabAcceleration);

    return <TabToDisplay acceleration={acc} settings={sett} mappings={mapp} />;
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
      <EuiFlyoutBody>
        {renderTabContent(selectedTab, { acceleration, settings, mappings })}
      </EuiFlyoutBody>
    </>
  );
};
