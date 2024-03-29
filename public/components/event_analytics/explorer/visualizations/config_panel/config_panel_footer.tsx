/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiButtonEmpty } from '@elastic/eui';

export const DefaultEditorControls = ({ isDirty, onConfigDiscard }: any) => {
  return (
    <div className="visEditorSidebar__controls">
      <EuiFlexGroup justifyContent="spaceBetween" gutterSize="none" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiButtonEmpty
            data-test-subj="visualizeEditorResetButton"
            disabled={!isDirty}
            iconType="cross"
            onClick={onConfigDiscard}
            size="s"
          >
            Reset
          </EuiButtonEmpty>
        </EuiFlexItem>
      </EuiFlexGroup>
    </div>
  );
};
