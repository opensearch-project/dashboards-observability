/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { v4 as uuidv4 } from 'uuid';

export const CUSTOM_PANELS_API_PREFIX = '/api/observability/operational_panels';
export const CUSTOM_PANELS_DOCUMENTATION_URL =
  'https://opensearch.org/docs/latest/observability-plugin/operational-panels/';
export const CREATE_PANEL_MESSAGE =
  'Enter a name to describe the purpose of this Observability Dashboard.';

export const CUSTOM_PANELS_SAVED_OBJECT_TYPE = 'observability-panel';

export const CUSTOM_PANEL_SLICE = 'customPanel';

export const samplePanelName = '[Logs] Web traffic Panel';

export const createDemoPanel = (savedVisualizationIds: string[]) => {
  return {
    name: samplePanelName,
    visualizations: [
      {
        id: 'panel_viz_' + uuidv4(),
        savedVisualizationId: savedVisualizationIds[0],
        x: 4,
        y: 6,
        w: 8,
        h: 2,
      },
      {
        id: 'panel_viz_' + uuidv4(),
        savedVisualizationId: savedVisualizationIds[1],
        x: 0,
        y: 2,
        w: 12,
        h: 2,
      },
      {
        id: 'panel_viz_' + uuidv4(),
        savedVisualizationId: savedVisualizationIds[2],
        x: 0,
        y: 0,
        w: 4,
        h: 2,
      },
      {
        id: 'panel_viz_' + uuidv4(),
        savedVisualizationId: savedVisualizationIds[3],
        x: 4,
        y: 0,
        w: 4,
        h: 2,
      },
      {
        id: 'panel_viz_' + uuidv4(),
        savedVisualizationId: savedVisualizationIds[4],
        x: 8,
        y: 0,
        w: 4,
        h: 2,
      },
      {
        id: 'panel_viz_' + uuidv4(),
        savedVisualizationId: savedVisualizationIds[5],
        x: 0,
        y: 4,
        w: 4,
        h: 2,
      },
      {
        id: 'panel_viz_' + uuidv4(),
        savedVisualizationId: savedVisualizationIds[6],
        x: 0,
        y: 6,
        w: 4,
        h: 2,
      },
      {
        id: 'panel_viz_' + uuidv4(),
        savedVisualizationId: savedVisualizationIds[7],
        x: 4,
        y: 4,
        w: 8,
        h: 2,
      },
    ],
    timeRange: { to: 'now/y', from: 'now/y' },
    queryFilter: { query: '', language: 'ppl' },
  };
};
