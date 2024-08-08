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

interface Props {
  closeModal: () => void;
  wrapper: { dashboardSelected: boolean };
  dashboardIds: Array<{ value: string; label: string }>;
  registerDashboard: () => void;
  closeModalVisible: () => void;
}
export function SelectDashboardModal({
  closeModal,
  wrapper,
  dashboardIds,
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

  useEffect(() => {
    if (selectedId) {
      const currentTitle = dashboardIds.find((item) => {
        return item.value === selectedId;
      });
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
          <h2>Select Dashboard</h2>
        </EuiText>
      </EuiModalHeader>
      <EuiModalBody>
        <EuiComboBox
          placeholder="Select a dashboard"
          singleSelection={{ asPlainText: true }}
          options={dashboardIds}
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
