/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiComboBox,
  EuiComboBoxOptionOption,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiSmallButton,
  EuiSmallButtonEmpty,
  EuiText,
} from '@elastic/eui';
import React, { useEffect, useState } from 'react';
import { useObservable } from 'react-use';
import { DashboardSavedObjectsType } from '../../../../common/types/overview';
import { useToast } from '../../common/toast';
import { ObsDashboardStateManager } from './obs_dashboard_state_manager';
import { getObservabilityDashboardsId, setObservabilityDashboardsId } from './utils';

export interface Props {
  closeFlyout: () => void;
  dashboardsSavedObjects: DashboardSavedObjectsType;
  reloadPage: () => void;
}

export function SelectDashboardFlyout({ closeFlyout, dashboardsSavedObjects, reloadPage }: Props) {
  const isDashboardSelected = useObservable(ObsDashboardStateManager.isDashboardSelected$);
  const [selectedOptionsState, setSelectedOptionsState] = useState<
    Array<EuiComboBoxOptionOption<string>>
  >([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [buttonIsActive, setButtonIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { setToast } = useToast();

  const onComboBoxChange = (options: Array<EuiComboBoxOptionOption<string>>) => {
    if (options.length > 0) {
      setButtonIsActive(options[0].value !== selectedId);
    }
    setSelectedOptionsState(options);
  };

  const onClickAdd = async () => {
    if (selectedOptionsState.length > 0) {
      setIsLoading(true);
      ObsDashboardStateManager.isDashboardSelected$.next(true);
      setObservabilityDashboardsId(selectedOptionsState[0].value ?? null).then(reloadPage);
      setIsLoading(false);
      closeFlyout();
    } else {
      setToast('Select a dashboard to be added', 'danger');
    }
  };

  useEffect(() => {
    setSelectedId(getObservabilityDashboardsId());
  }, []);

  const options: Array<EuiComboBoxOptionOption<string>> = Object.keys(dashboardsSavedObjects).map(
    (key) => ({
      value: key,
      label: dashboardsSavedObjects[key].label,
    })
  );

  useEffect(() => {
    if (selectedId) {
      const currentTitle: EuiComboBoxOptionOption<string> = {
        value: selectedId,
        label: dashboardsSavedObjects[selectedId].label,
      };
      if (currentTitle) {
        setSelectedOptionsState([currentTitle]);
        setButtonIsActive(false);
      }
    }
  }, [selectedId]);

  return (
    <EuiFlyout onClose={closeFlyout} size="s">
      <EuiFlyoutHeader>
        <EuiText size="s">
          <h2>{selectedId ? 'Replace Dashboard' : 'Select Dashboard'}</h2>
        </EuiText>
      </EuiFlyoutHeader>
      <EuiFlyoutBody>
        <EuiComboBox
          placeholder="Search"
          singleSelection={{ asPlainText: true }}
          options={options}
          selectedOptions={selectedOptionsState}
          onChange={onComboBoxChange}
        />
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
              disabled={!buttonIsActive}
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
