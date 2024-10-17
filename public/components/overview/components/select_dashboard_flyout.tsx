/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiSelectable,
  EuiSmallButton,
  EuiSmallButtonEmpty,
  EuiText,
  EuiIcon,
  EuiSpacer,
  EuiTitle,
} from '@elastic/eui';
import React, { useEffect, useState } from 'react';
import { useObservable } from 'react-use';
import { DashboardSavedObjectsType } from '../../../../common/types/overview';
import { useToast } from '../../common/toast';
import { ObsDashboardStateManager } from './obs_dashboard_state_manager';
import { getObservabilityDashboardsId, setObservabilityDashboardsId } from './utils';
import { coreRefs } from '../../../framework/core_refs';
import { tutorialSampleDataPluginId } from '../../../../common/constants/shared';

export interface Props {
  closeFlyout: () => void;
  dashboardsSavedObjects: DashboardSavedObjectsType;
  reloadPage: () => void;
}

export function SelectDashboardFlyout({ closeFlyout, dashboardsSavedObjects, reloadPage }: Props) {
  const isDashboardSelected = useObservable(ObsDashboardStateManager.isDashboardSelected$);
  const [selectedId, setSelectedId] = useState<string>('');
  const [buttonIsActive, setButtonIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { setToast } = useToast();

  const [options, setOptions] = useState(
    Object.keys(dashboardsSavedObjects).map((key) => ({
      label: dashboardsSavedObjects[key].label,
      key,
      checked: undefined,
    }))
  );

  const onSelectionChange = (
    newOptions: Array<{ label: string; key?: string; checked?: 'on' | undefined }>
  ) => {
    setOptions(newOptions);
    const selectedOption = newOptions.find((option) => option.checked === 'on');
    if (selectedOption) {
      setButtonIsActive(selectedOption.key !== selectedId);
    }
  };

  const onClickAdd = async () => {
    const selectedOption = options.find((option) => option.checked === 'on');
    if (selectedOption && selectedOption.key) {
      setIsLoading(true);
      ObsDashboardStateManager.isDashboardSelected$.next(true);
      await setObservabilityDashboardsId(selectedOption.key);
      reloadPage();
      setIsLoading(false);
      closeFlyout();
    } else {
      setToast('Select a dashboard to be added', 'danger');
    }
  };

  useEffect(() => {
    const currentSelectedId = getObservabilityDashboardsId();
    setSelectedId(currentSelectedId);
    const optionsArray = Object.keys(dashboardsSavedObjects).map((key) => ({
      label: dashboardsSavedObjects[key].label,
      key,
      checked: key === currentSelectedId ? 'on' : undefined,
    }));
    setOptions(optionsArray);
  }, [dashboardsSavedObjects]);

  return (
    <EuiFlyout onClose={closeFlyout} size="s">
      <EuiFlyoutHeader>
        <EuiText size="s">
          <h2>{selectedId ? 'Replace Dashboard' : 'Select Dashboard'}</h2>
        </EuiText>
      </EuiFlyoutHeader>
      <EuiFlyoutBody className="selectable-flyout-body">
        {Object.keys(dashboardsSavedObjects).length === 0 ? (
          <EuiFlexGroup direction="column" alignItems="center" justifyContent="center">
            <EuiFlexItem grow={false}>
              <EuiIcon type="dashboardApp" size="xl" />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiTitle size="s">
                <h3>No dashboards</h3>
              </EuiTitle>
            </EuiFlexItem>
            <EuiSpacer size="l" />
            <EuiFlexGroup justifyContent="center" gutterSize="m">
              <EuiFlexItem grow={false}>
                <EuiSmallButton
                  onClick={() =>
                    coreRefs.application?.navigateToApp(tutorialSampleDataPluginId, { path: '#' })
                  }
                >
                  Install Sample Data
                </EuiSmallButton>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiSmallButton
                  onClick={() => coreRefs.application?.navigateToApp('dashboards', { path: '#/' })}
                  iconType="plusInCircle"
                  fill
                >
                  Create Dashboard
                </EuiSmallButton>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexGroup>
        ) : (
          <EuiSelectable
            searchable
            searchProps={{
              placeholder: 'Search for a dashboard...',
              compressed: true,
            }}
            singleSelection="always"
            options={options}
            onChange={onSelectionChange}
            listProps={{ bordered: false }}
            height="full"
          >
            {(list, search) => (
              <>
                {search}
                {list}
              </>
            )}
          </EuiSelectable>
        )}
      </EuiFlyoutBody>
      <EuiFlyoutFooter>
        <EuiFlexGroup justifyContent="spaceBetween" gutterSize="m">
          <EuiFlexItem grow={false}>
            <EuiSmallButtonEmpty color="danger" iconType="cross" onClick={closeFlyout}>
              Cancel
            </EuiSmallButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiSmallButton
              onClick={onClickAdd}
              fill
              disabled={!buttonIsActive || Object.keys(dashboardsSavedObjects).length === 0}
              isLoading={isLoading}
            >
              {isDashboardSelected ? 'Replace' : 'Select'}
            </EuiSmallButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </EuiFlyout>
  );
}
