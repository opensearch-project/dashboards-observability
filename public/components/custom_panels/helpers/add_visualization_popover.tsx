/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiSmallButton, EuiContextMenu, EuiPopover } from '@elastic/eui';
import React, { useState } from 'react';
import {
  CREATE_TAB_PARAM,
  CREATE_TAB_PARAM_KEY,
  TAB_CHART_ID,
} from '../../../../common/constants/explorer';
import { observabilityLogsID } from '../../../../common/constants/shared';

interface AddVisualizationPopoverProps {
  showFlyout: (isReplacement?: boolean, replaceVizId?: string) => void;
  addVizDisabled: boolean;
}

export const AddVisualizationPopover = ({
  addVizDisabled,
  showFlyout,
}: AddVisualizationPopoverProps) => {
  const [isVizPopoverOpen, setVizPopoverOpen] = useState(false); // Add Visualization Popover

  const onPopoverClick = () => {
    setVizPopoverOpen(!isVizPopoverOpen);
  };

  const closeVizPopover = () => {
    setVizPopoverOpen(false);
  };

  const advancedVisualization = () => {
    closeVizPopover();
    window.location.assign(
      `${observabilityLogsID}#/explorer?${CREATE_TAB_PARAM_KEY}=${CREATE_TAB_PARAM[TAB_CHART_ID]}`
    );
  };

  const getVizContextPanels = () => {
    return [
      {
        id: 0,
        title: 'Add visualization',
        items: [
          {
            name: 'Select existing visualization',
            'data-test-subj': 'selectExistingVizContextMenuItem',
            onClick: () => {
              if (closeVizPopover != null) {
                closeVizPopover();
              }
              showFlyout();
            },
          },
          {
            name: 'Create new visualization',
            'data-test-subj': 'createNewVizContextMenuItem',
            onClick: () => {
              advancedVisualization();
            },
          },
        ],
      },
    ];
  };

  const addVisualizationButton = (
    <EuiSmallButton
      data-test-subj="addVisualizationButton"
      iconType="arrowDown"
      iconSide="right"
      disabled={addVizDisabled}
      onClick={onPopoverClick}
    >
      Add visualization
    </EuiSmallButton>
  );
  return (
    <EuiPopover
      id="addVisualizationContextMenu"
      button={addVisualizationButton}
      isOpen={isVizPopoverOpen}
      closePopover={closeVizPopover}
      panelPaddingSize="none"
      anchorPosition="downLeft"
    >
      <EuiContextMenu initialPanelId={0} panels={getVizContextPanels()} />
    </EuiPopover>
  );
};
