/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EuiOverlayMask, EuiConfirmModal } from '@elastic/eui';
import { CachedAccelerations } from '../../../../../../../common/types/data_connections';
import { ACC_DELETE_MSG } from '../utils/acceleration_utils';

interface DeleteConfirmationModalProps {
  isVisible: boolean;
  acceleration: CachedAccelerations | null;
  onCancel: () => void;
  onConfirm: (acceleration: CachedAccelerations) => void;
}

export const AccelerationDeletionOverlay: React.FC<DeleteConfirmationModalProps> = ({
  isVisible,
  acceleration,
  onCancel,
  onConfirm,
}) => {
  if (!isVisible || !acceleration) {
    return null;
  }

  return (
    <EuiOverlayMask>
      <EuiConfirmModal
        title={`Delete acceleration ${acceleration.indexName}?`}
        onCancel={onCancel}
        onConfirm={() => onConfirm(acceleration)}
        cancelButtonText="Cancel"
        confirmButtonText="Delete"
        buttonColor="danger"
        defaultFocusedButton="confirm"
      >
        <p>{ACC_DELETE_MSG}</p>
      </EuiConfirmModal>
    </EuiOverlayMask>
  );
};
