/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { merge } from 'lodash';
import React from 'react';
import { toMountPoint } from '../../../../src/plugins/opensearch_dashboards_react/public';
import { SavedVisualization } from '../../common/types/explorer';
import { SavedObjectVisualization } from '../components/visualizations/saved_object_visualization';
import { coreRefs } from '../framework/core_refs';
import { AssistantSetup } from '../types';
import { PPLVisualizationModal } from './components/ppl_visualization_model';

export const registerAsssitantDependencies = (setup?: AssistantSetup) => {
  if (!setup) return;

  setup.registerContentRenderer('ppl_visualization', (content) => {
    const params = content as Partial<SavedVisualization>;
    const savedVisualization = createSavedVisualization(params);
    return (
      <SavedObjectVisualization
        savedVisualization={savedVisualization}
        timeRange={{
          from: savedVisualization.selected_date_range.start,
          to: savedVisualization.selected_date_range.end,
        }}
      />
    );
  });

  setup.registerActionExecutor('view_ppl_visualization', async (params) => {
    const savedVisualization = createSavedVisualization(params as Partial<SavedVisualization>);
    const modal = coreRefs.core!.overlays.openModal(
      toMountPoint(
        <PPLVisualizationModal
          savedVisualization={savedVisualization}
          onClose={() => modal.close()}
        />
      )
    );
  });
};

const createSavedVisualization = (params: Partial<SavedVisualization>) => {
  return merge(
    {
      query: params.query,
      selected_date_range: { start: 'now-14d', end: 'now', text: '' },
      selected_timestamp: { name: 'timestamp', type: 'timestamp' },
      selected_fields: { tokens: [], text: '' },
      name: params.name,
      description: '',
      type: 'line',
      sub_type: 'visualization',
    },
    {
      selected_date_range: params.selected_date_range,
      selected_timestamp: params.selected_timestamp,
      type: params.type,
    }
  ) as SavedVisualization;
};
