/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { EuiOverlayMask, EuiConfirmModal, EuiFormRow, EuiFieldText } from '@elastic/eui';
import { CachedAcceleration } from '../../../../../../common/types/data_connections';
import { ACC_DELETE_MSG, ACC_VACUUM_MSG } from './utils/acceleration_utils';

interface AccelerationActionOverlayProps {
  isVisible: boolean;
  actionType: 'delete' | 'vacuum';
  acceleration: CachedAcceleration | null;
  onCancel: () => void;
  onConfirm: (acceleration: CachedAcceleration) => void;
}

export const AccelerationActionOverlay: React.FC<AccelerationActionOverlayProps> = ({
  isVisible,
  actionType,
  acceleration,
  onCancel,
  onConfirm,
}) => {
  const [confirmationInput, setConfirmationInput] = useState('');

  if (!isVisible || !acceleration) {
    return null;
  }

  const isVacuumAction = actionType === 'vacuum';
  const title = isVacuumAction
    ? `Vacuum acceleration ${acceleration.indexName}?`
    : `Delete acceleration ${acceleration.indexName}?`;
  const description = isVacuumAction ? ACC_VACUUM_MSG : ACC_DELETE_MSG;

  const confirmEnabled = isVacuumAction ? confirmationInput === acceleration.indexName : true;

  return (
    <EuiOverlayMask>
      <EuiConfirmModal
        title={title}
        onCancel={onCancel}
        onConfirm={() => onConfirm(acceleration)}
        cancelButtonText="Cancel"
        confirmButtonText={isVacuumAction ? 'Vacuum' : 'Delete'}
        buttonColor="danger"
        defaultFocusedButton="confirm"
        confirmButtonDisabled={!confirmEnabled}
      >
        <p>{description}</p>
        {isVacuumAction && (
          <EuiFormRow label={`To confirm your action, type ${acceleration.indexName}`}>
            <EuiFieldText
              name="confirmationInput"
              value={confirmationInput}
              onChange={(e) => setConfirmationInput(e.target.value)}
            />
          </EuiFormRow>
        )}
      </EuiConfirmModal>
    </EuiOverlayMask>
  );
};
