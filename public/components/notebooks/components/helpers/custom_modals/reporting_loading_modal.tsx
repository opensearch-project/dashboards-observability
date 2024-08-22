/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiOverlayMask,
  EuiModal,
  EuiModalHeader,
  EuiText,
  EuiModalBody,
  EuiSpacer,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiSmallButton,
} from '@elastic/eui';
import React from 'react';

export function GenerateReportLoadingModal(props: { setShowLoading: any }) {
  const { setShowLoading } = props;

  const closeModal = () => {
    setShowLoading(false);
  };

  return (
    <div>
      <EuiOverlayMask>
        <EuiModal
          onClose={closeModal}
          style={{ maxWidth: 350, minWidth: 300 }}
          id="downloadInProgressLoadingModal"
        >
          <EuiModalHeader>
            <EuiText size="s" textAlign="right">
              <h2>Generating report</h2>
            </EuiText>
          </EuiModalHeader>
          <EuiModalBody>
            <EuiText size="s">Preparing your file for download.</EuiText>
            <EuiText size="s">
              You can close this dialog while we continue in the background.
            </EuiText>
            <EuiSpacer />
            <EuiFlexGroup justifyContent="center" alignItems="center">
              <EuiFlexItem grow={false}>
                <EuiLoadingSpinner size="xl" style={{ minWidth: 75, minHeight: 75 }} />
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="l" />
            <EuiFlexGroup alignItems="flexEnd" justifyContent="flexEnd">
              <EuiFlexItem grow={false}>
                <EuiSmallButton
                  data-test-subj="reporting-loading-modal-close-button"
                  onClick={closeModal}
                >
                  Close
                </EuiSmallButton>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiModalBody>
        </EuiModal>
      </EuiOverlayMask>
    </div>
  );
}
