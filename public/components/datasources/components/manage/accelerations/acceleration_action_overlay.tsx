/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { EuiOverlayMask, EuiConfirmModal, EuiCompressedFormRow, EuiCompressedFieldText } from '@elastic/eui';
import { CachedAcceleration } from '../../../../../../common/types/data_connections';
import {
  ACC_DELETE_MSG,
  ACC_VACUUM_MSG,
  ACC_SYNC_MSG,
  AccelerationActionType,
  getAccelerationName,
  getAccelerationFullPath,
} from './utils/acceleration_utils';

export interface AccelerationActionOverlayProps {
  isVisible: boolean;
  actionType: AccelerationActionType;
  acceleration: CachedAcceleration | null;
  dataSourceName: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export const AccelerationActionOverlay: React.FC<AccelerationActionOverlayProps> = ({
  isVisible,
  actionType,
  acceleration,
  dataSourceName,
  onCancel,
  onConfirm,
}) => {
  const [confirmationInput, setConfirmationInput] = useState('');

  if (!isVisible || !acceleration) {
    return null;
  }

  const displayIndexName = getAccelerationName(acceleration);
  const displayFullPath = getAccelerationFullPath(acceleration, dataSourceName);

  let title = '';
  let description = '';
  let confirmButtonText = 'Confirm';
  let confirmEnabled = true;

  switch (actionType) {
    case 'vacuum':
      title = `Vacuum acceleration ${displayIndexName} on ${displayFullPath} ?`;
      description = ACC_VACUUM_MSG;
      confirmButtonText = 'Vacuum';
      confirmEnabled = confirmationInput === displayIndexName;
      break;
    case 'delete':
      title = `Delete acceleration ${displayIndexName} on ${displayFullPath} ?`;
      description = ACC_DELETE_MSG(displayIndexName);
      confirmButtonText = 'Delete';
      break;
    case 'sync':
      title = 'Manual sync data?';
      description = ACC_SYNC_MSG;
      confirmButtonText = 'Sync';
      break;
  }

  return (
    <EuiOverlayMask>
      <EuiConfirmModal
        title={title}
        onCancel={onCancel}
        onConfirm={() => onConfirm()}
        cancelButtonText="Cancel"
        confirmButtonText={confirmButtonText}
        buttonColor="danger"
        defaultFocusedButton="confirm"
        confirmButtonDisabled={!confirmEnabled}
      >
        <p>{description}</p>
        {actionType === 'vacuum' && (
          <EuiCompressedFormRow label={`To confirm, type ${displayIndexName}`}>
            <EuiCompressedFieldText
              name="confirmationInput"
              value={confirmationInput}
              onChange={(e) => setConfirmationInput(e.target.value)}
            />
          </EuiCompressedFormRow>
        )}
      </EuiConfirmModal>
    </EuiOverlayMask>
  );
};
