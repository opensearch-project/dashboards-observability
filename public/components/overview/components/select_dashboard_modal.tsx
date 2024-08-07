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
} from '@elastic/eui';
import React from 'react';

interface Props {
  closeModal: () => void;
  dashboardSelected: React.MutableRefObject<boolean>;
  dashboardIds: Array<{ value: string; label: string }>;
  selectedOptionsState: EuiComboBoxOptionOption[];
  onComboBoxChange: (options: EuiComboBoxOptionOption[]) => void;
  onClickAdd: () => void;
}
export function SelectDashboardModal({
  closeModal,
  dashboardSelected,
  dashboardIds,
  selectedOptionsState,
  onComboBoxChange,
  onClickAdd,
}: Props) {
  return (
    <EuiModal onClose={closeModal}>
      <EuiModalHeader>
        <div>Select Dashboard</div>
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
        <EuiFlexGroup justifyContent="center" gutterSize="m">
          <EuiFlexItem grow={false}>
            <EuiButton onClick={closeModal}>Cancel</EuiButton>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton onClick={onClickAdd} fill>
              {dashboardSelected ? 'Update' : 'Add'}
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiModalFooter>
    </EuiModal>
  );
}
