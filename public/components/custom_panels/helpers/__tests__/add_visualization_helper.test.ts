/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import { addVisualizationPanel, addMultipleVisualizations } from '../add_visualization_helper';
import { samplePanelVisualizations } from '../../../../../test/panels_constants';

describe('Add Visualization Helper', () => {
  configure({ adapter: new Adapter() });

  it('addVisualizationPanel', async () => {
    const savedVisualizationId = 'test_id';
    const oldVisualizationId = undefined;

    const panelList = addVisualizationPanel(
      savedVisualizationId,
      oldVisualizationId,
      samplePanelVisualizations
    );
    const newPanel = panelList[panelList.length - 1];

    expect(newPanel.y).toEqual(samplePanelVisualizations[1].y + 4);
  });

  it('addMultipleVisualizations', () => {
    const savedVisualizationIds = ['test_id_1', 'test_id_2'];

    const panelList = addMultipleVisualizations(savedVisualizationIds, samplePanelVisualizations);
    const testPanel1 = panelList[panelList.length - 2];
    const testPanel2 = panelList[panelList.length - 1];

    expect(testPanel1.y).toEqual(samplePanelVisualizations[1].y + 4);
    expect(testPanel2.y).toEqual(testPanel1.y + 4);
  });
});
