/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiButton,
  EuiComboBox,
  EuiComboBoxOptionOption,
  EuiFlexGroup,
  EuiFlexItem,
  EuiModal,
  EuiModalBody,
  EuiModalFooter,
  EuiModalHeader,
  EuiText,
} from '@elastic/eui';
import React, { useEffect, useState } from 'react';
import { uiSettingsService } from '../../../../common/utils';
import { DashboardDictionary } from '../home';

interface Props {
  closeModal: () => void;
  wrapper: { dashboardSelected: boolean };
  dashboards: DashboardDictionary;
  registerDashboard: () => void;
  closeModalVisible: () => void;
}
export function SelectDashboardModal({
  closeModal,
  wrapper,
  dashboards,
  registerDashboard,
  closeModalVisible,
}: Props) {
  const [selectedOptionsState, setSelectedOptionsState] = useState<EuiComboBoxOptionOption[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [buttonIsActive, setButtonIsActive] = useState(false);

  const onComboBoxChange = (options: EuiComboBoxOptionOption[]) => {
    if (options.length > 0) {
      setButtonIsActive(options[0].value?.toString() !== selectedId);
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
    closeModalVisible();
  };

  useEffect(() => {
    setSelectedId(uiSettingsService.get('observability:defaultDashboard'));
  }, []);

  const options: EuiComboBoxOptionOption[] = Object.keys(dashboards).map((key) => ({
    value: key,
    label: dashboards[key].label,
  }));

  useEffect(() => {
    if (selectedId) {
      const currentTitle: EuiComboBoxOptionOption = {
        value: selectedId,
        label: dashboards[selectedId].label,
      };
      if (currentTitle) {
        const comboBoxOption: Array<EuiComboBoxOptionOption<string>> = [currentTitle];
        setSelectedOptionsState(comboBoxOption);
        setButtonIsActive(false);
      }
    }
  }, [selectedId]);

  return (
    <EuiModal onClose={closeModal}>
      <EuiModalHeader>
        <EuiText size="s">
          <h2>{selectedId ? 'Update Dashboard' : 'Select Dashboard'}</h2>
        </EuiText>
      </EuiModalHeader>
      <EuiModalBody>
        <EuiComboBox
          placeholder="Select a dashboard"
          singleSelection={{ asPlainText: true }}
          options={options}
          selectedOptions={selectedOptionsState}
          onChange={onComboBoxChange}
        />
      </EuiModalBody>
      <EuiModalFooter>
        <EuiFlexGroup justifyContent="flexEnd" gutterSize="m">
          <EuiFlexItem grow={false}>
            <EuiButton onClick={closeModal}>Cancel</EuiButton>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            {buttonIsActive ? (
              <EuiButton onClick={onClickAdd} fill>
                {wrapper.dashboardSelected ? 'Update' : 'Add'}
              </EuiButton>
            ) : (
              <EuiButton onClick={onClickAdd} fill disabled>
                {wrapper.dashboardSelected ? 'Update' : 'Add'}
              </EuiButton>
            )}
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiModalFooter>
    </EuiModal>
  );
}
