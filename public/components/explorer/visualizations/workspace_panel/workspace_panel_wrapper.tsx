/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import './workspace_panel_wrapper.scss';

import React from 'react';
import {
  EuiPageContentBody,
  EuiComboBox,
  EuiFlexGroup,
  EuiFlexItem
} from '@elastic/eui';

export function WorkspacePanelWrapper({
  children,
  setVis,
  visualizationTypes,
  getSelectedVisById,
  curVisId,
  vizSelectableItemRenderer
}: any) {

  return (
    <>
      <EuiFlexGroup>
        <EuiFlexItem grow={false}>
          <EuiComboBox
            aria-label="config chart selector"
            placeholder="Select a chart"
            options={visualizationTypes}
            selectedOptions={[getSelectedVisById(curVisId)]}
            singleSelection
            onChange={(visType) => {
              setVis(visType[0].id);
            }}
            fullWidth
            renderOption={vizSelectableItemRenderer}
            isClearable={false}
          />
        </EuiFlexItem>
        <EuiFlexItem grow={3}/>
      </EuiFlexGroup>
      <EuiPageContentBody className="vizWorkspacePanelWrapper__pageContentBody">
        {children}
      </EuiPageContentBody>
    </>
  );
}
