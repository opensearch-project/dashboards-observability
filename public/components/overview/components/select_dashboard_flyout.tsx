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
import { uiSettingsService } from '../../../../common/utils';
import { DashboardDictionary } from '../home';

interface Props {
  closeFlyout: () => void;
  wrapper: { dashboardSelected: boolean };
  dashboards: DashboardDictionary;
  registerDashboard: () => void;
}

export function SelectDashboardFlyout({
  closeFlyout,
  wrapper,
  dashboards,
  registerDashboard,
}: Props) {
  const [selectedOptionsState, setSelectedOptionsState] = useState<
    Array<EuiComboBoxOptionOption<string>>
  >([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [buttonIsActive, setButtonIsActive] = useState(false);

  const onComboBoxChange = (options: Array<EuiComboBoxOptionOption<string>>) => {
    if (options.length > 0) {
      setButtonIsActive(options[0].value !== selectedId);
    }
    setSelectedOptionsState(options);
  };

  const onClickAdd = () => {
    if (selectedOptionsState.length > 0) {
      wrapper.dashboardSelected = true;
      uiSettingsService
        .set('observability:defaultDashboard', selectedOptionsState[0].value)
        .then(registerDashboard);
    }
    closeFlyout();
  };

  useEffect(() => {
    setSelectedId(uiSettingsService.get('observability:defaultDashboard'));
  }, []);

  const options: Array<EuiComboBoxOptionOption<string>> = Object.keys(dashboards).map((key) => ({
    value: key,
    label: dashboards[key].label,
  }));

  useEffect(() => {
    if (selectedId) {
      const currentTitle: EuiComboBoxOptionOption<string> = {
        value: selectedId,
        label: dashboards[selectedId].label,
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
            <EuiSmallButton onClick={onClickAdd} fill disabled={!buttonIsActive}>
              {wrapper.dashboardSelected ? 'Replace' : 'Add'}
            </EuiSmallButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </EuiFlyout>
  );
}
