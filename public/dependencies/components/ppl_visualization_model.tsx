/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiButton,
  EuiButtonEmpty,
  EuiCodeBlock,
  EuiModalBody,
  EuiModalFooter,
  EuiModalHeader,
  EuiModalHeaderTitle,
} from '@elastic/eui';
import React from 'react';
import { SavedVisualization } from '../../../common/types/explorer';
import { SavedObjectVisualization } from '../../components/visualizations/saved_object_visualization';
import { PPLSavedVisualizationClient } from '../../services/saved_objects/saved_object_client/ppl';

interface PPLVisualizationModelProps {
  savedVisualization: SavedVisualization;
  onClose: () => void;
}

export const PPLVisualizationModal: React.FC<PPLVisualizationModelProps> = (props) => {
  return (
    <>
      <EuiModalHeader>
        <EuiModalHeaderTitle style={{ fontSize: '1.25rem' }}>
          {props.savedVisualization.name}
        </EuiModalHeaderTitle>
      </EuiModalHeader>

      <EuiModalBody>
        <div>
          <EuiCodeBlock isCopyable>{props.savedVisualization.query}</EuiCodeBlock>
          <SavedObjectVisualization
            savedVisualization={props.savedVisualization}
            timeRange={{
              from: props.savedVisualization.selected_date_range.start,
              to: props.savedVisualization.selected_date_range.end,
            }}
          />
        </div>
      </EuiModalBody>

      <EuiModalFooter>
        <EuiButton
          onClick={async () => {
            const response = await savePPLVisualization(props.savedVisualization);
            props.onClose();
            window.open(`./observability-logs#/explorer/${response.objectId}`, '_blank');
          }}
          fill
        >
          Save
        </EuiButton>
        <EuiButtonEmpty onClick={props.onClose}>Close</EuiButtonEmpty>
      </EuiModalFooter>
    </>
  );
};

const savePPLVisualization = (savedVisualization: SavedVisualization) => {
  const createParams = {
    query: savedVisualization.query,
    name: savedVisualization.name,
    dateRange: [
      savedVisualization.selected_date_range.start,
      savedVisualization.selected_date_range.end,
    ],
    fields: [],
    timestamp: '',
    type: savedVisualization.type,
    sub_type: 'visualization',
  };
  return PPLSavedVisualizationClient.getInstance().create(createParams);
};
