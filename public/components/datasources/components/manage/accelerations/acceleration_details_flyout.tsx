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
import { OpenSearchDashboardsResponse } from '../../../../../../../../src/core/server/http/router';
import { CachedAcceleration } from '../../../../../../common/types/data_connections';
import { coreRefs } from '../../../../../framework/core_refs';
import { AccelerationActionOverlay } from './acceleration_action_overlay';
import { useAccelerationOperation } from './acceleration_operation';
import { AccelerationDetailsTab } from './flyout_modules/acceleration_details_tab';
import { AccelerationSchemaTab } from './flyout_modules/accelerations_schema_tab';
import {
  AccelerationActionType,
  getAccelerationName,
  onDiscoverIconClick,
} from './utils/acceleration_utils';

export interface AccelerationDetailsFlyoutProps {
  acceleration: CachedAcceleration;
  dataSourceName: string;
  resetFlyout: () => void;
  handleRefresh?: () => void;
  dataSourceMDSId?: string;
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
  const { dataSourceName, acceleration, resetFlyout, handleRefresh } = props;
  const { flintIndexName } = acceleration;
  const [selectedTab, setSelectedTab] = useState('details');
  const tabsMap: { [key: string]: any } = {
    details: AccelerationDetailsTab,
    schema: AccelerationSchemaTab,
  };
  const [operationType, setOperationType] = useState<AccelerationActionType | null>(null);
  const [showConfirmationOverlay, setShowConfirmationOverlay] = useState(false);

  const { performOperation, operationSuccess } = useAccelerationOperation(props.dataSourceName);

  const displayedIndex = getAccelerationName(acceleration);

  const onConfirmOperation = () => {
    if (operationType && props.acceleration) {
      performOperation(props.acceleration, operationType);
      setShowConfirmationOverlay(false);
    }
  };

  const onSyncIconClickHandler = () => {
    setOperationType('sync');
    setShowConfirmationOverlay(true);
  };

  const onDeleteIconClickHandler = () => {
    setOperationType('delete');
    setShowConfirmationOverlay(true);
  };

  const onVacuumIconClickHandler = () => {
    setOperationType('vacuum');
    setShowConfirmationOverlay(true);
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
    if (operationSuccess) {
      resetFlyout();
      handleRefresh?.();
      setOperationType(null);
      setShowConfirmationOverlay(false);
    }
  }, [operationSuccess, resetFlyout, handleRefresh]);

  useEffect(() => {
    if (flintIndexName !== undefined && flintIndexName.trim().length > 0) {
      getAccDetail(flintIndexName);
    }
  }, [flintIndexName]);

  const DiscoverIcon = () => {
    return (
      <EuiButtonEmpty
        onClick={() => {
          onDiscoverIconClick(acceleration, dataSourceName);
          resetFlyout();
        }}
      >
        <EuiIcon type={'discoverApp'} size="m" />
      </EuiButtonEmpty>
    );
  };

  const SyncIcon = ({ autoRefresh, status }: { autoRefresh: boolean; status: string }) => {
    if (autoRefresh || status !== 'active') {
      return null;
    }
    return (
      <EuiButtonEmpty onClick={onSyncIconClickHandler}>
        <EuiIcon type="inputOutput" size="m" />
      </EuiButtonEmpty>
    );
  };

  const DeleteIcon = () => {
    return (
      <EuiButtonEmpty onClick={onDeleteIconClickHandler}>
        <EuiIcon type="trash" size="m" />
      </EuiButtonEmpty>
    );
  };

  const VacuumIcon = () => {
    return (
      <EuiButtonEmpty onClick={onVacuumIconClickHandler}>
        <EuiIcon type="broom" size="m" />
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
        propsForTab = { acceleration, settings, mappings, indexInfo, dataSourceName, resetFlyout };
        break;
      case 'schema':
        propsForTab = { mappings, indexInfo };
        break;
      default:
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
              <h2 className="panel-title">{displayedIndex}</h2>
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <SyncIcon autoRefresh={acceleration.autoRefresh} status={acceleration.status} />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <DiscoverIcon />
          </EuiFlexItem>
          {acceleration.status !== 'deleted' ? (
            <EuiFlexItem grow={false}>
              <DeleteIcon />
            </EuiFlexItem>
          ) : (
            <EuiFlexItem grow={false}>
              <VacuumIcon />
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
        <EuiSpacer size="m" />
        <EuiTabs style={{ marginBottom: '-25px' }}>{renderTabs()}</EuiTabs>
      </EuiFlyoutHeader>
      <EuiFlyoutBody>{renderTabContent(selectedTab)}</EuiFlyoutBody>
      {showConfirmationOverlay && operationType && (
        <AccelerationActionOverlay
          isVisible={showConfirmationOverlay}
          actionType={operationType as AccelerationActionType}
          acceleration={acceleration}
          dataSourceName={dataSourceName}
          onCancel={() => setShowConfirmationOverlay(false)}
          onConfirm={onConfirmOperation}
        />
      )}
    </>
  );
};
