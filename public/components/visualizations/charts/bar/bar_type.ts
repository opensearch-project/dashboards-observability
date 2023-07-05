/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bar } from './bar';
import { getPlotlySharedConfigs, getPlotlyCategory } from '../shared/shared_configs';
import { VizDataPanel } from '../../../explorer/visualizations/config_panel/config_editor/default_vis_editor';
import { ConfigEditor } from '../../../explorer/visualizations/config_panel/config_editor/config_editor';
import { ConfigValueOptions } from '../../../explorer/visualizations/config_panel/config_editor/config_controls';
import { ConfigAvailability } from '../../../explorer/visualizations/config_panel/config_editor/config_controls/config_availability';

const sharedConfigs = getPlotlySharedConfigs();
const VIS_CATEGORY = getPlotlyCategory();

export const createBarTypeDefinition = (params: any) => ({
  name: 'bar',
  type: 'bar',
  id: 'bar',
  label: 'Bar',
  fullLabel: 'Bar',
  iconType: 'visBarVerticalStacked',
  selection: {
    dataLoss: 'nothing',
  },
  category: VIS_CATEGORY.BASICS,
  categoryAxis: 'xaxis',
  seriesAxis: 'yaxis',
  orientation: 'v',
  component: Bar,
  editorConfig: {
    panelTabs: [
      {
        id: 'data-panel',
        name: 'Data',
        mapTo: 'dataConfig',
        editor: VizDataPanel,
        sections: [
          {
            id: 'value_options',
            name: 'Value options',
            editor: ConfigValueOptions,
            mapTo: 'valueOptions',
            schemas: [
              {
                name: 'X-axis',
                isSingleSelection: false,
                component: null,
                mapTo: 'xaxis',
              },
              {
                name: 'Y-axis',
                isSingleSelection: false,
                component: null,
                mapTo: 'yaxis',
              },
            ],
          },
          {
            id: 'chart_options',
            name: 'Chart options',
            editor: ConfigValueOptions,
            mapTo: 'chartOptions',
            schemas: [
              {
                name: 'Orientation',
                isSingleSelection: true,
                component: null,
                mapTo: 'orientation',
                props: {
                  dropdownList: [
                    { name: 'Vertical', orientationId: 'v' },
                    { name: 'Horizontal', orientationId: 'h' },
                  ],
                  defaultSelections: [{ name: 'Vertical', orientationId: 'v' }],
                },
              },
              {
                name: 'Mode',
                isSingleSelection: true,
                component: null,
                mapTo: 'mode',
                props: {
                  dropdownList: [
                    { name: 'Group', modeId: 'group' },
                    { name: 'Stack', modeId: 'stack' },
                  ],
                  defaultSelections: [{ name: 'Group', modeId: 'group' }],
                },
              },
            ],
          },
        ],
      },
      {
        id: 'style-panel',
        name: 'Layout',
        mapTo: 'layoutConfig',
        editor: ConfigEditor,
        content: [],
      },
      {
        id: 'availability-panel',
        name: 'Availability',
        mapTo: 'availabilityConfig',
        editor: ConfigAvailability,
      },
    ],
  },
  visConfig: {
    layout: {
      ...sharedConfigs.layout,
    },
    config: {
      ...sharedConfigs.config,
    },
    isUniColor: false,
  },
});
