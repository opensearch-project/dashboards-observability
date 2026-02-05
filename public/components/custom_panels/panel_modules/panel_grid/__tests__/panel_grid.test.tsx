/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor } from '@testing-library/react';
import React from 'react';
// eslint-disable-next-line jest/no-mocks-import
import httpClientMock from '../../../../../../test/__mocks__/httpClientMock';
import { PanelGrid } from '../panel_grid';
import PPLService from '../../../../../services/requests/ppl';
import { VisualizationType } from '../../../../../../common/types/custom_panels';
// eslint-disable-next-line jest/no-mocks-import
import { coreStartMock } from '../../../../../../test/__mocks__/coreMocks';

describe('Panel Grid Component', () => {
  it('renders panel grid component with empty visualizations', async () => {
    const http = httpClientMock;
    const core = coreStartMock;
    const panelId = '';
    const panelVisualizations: VisualizationType[] = [];
    const setPanelVisualizations = jest.fn();
    const editMode = false;
    const pplService = new PPLService(httpClientMock);
    const start = 'now-15m';
    const end = 'now';
    const onRefresh = false;
    const cloneVisualization = jest.fn();
    const pplFilterValue = '';
    const showFlyout = jest.fn();
    const editActionType = '';
    const onEditClick = (savedVisId: string) => {
      window.location.assign(`#/event_analytics/explorer/${savedVisId}`);
    };

    render(
      <PanelGrid
        http={http}
        panelId={panelId}
        chrome={core.chrome}
        panelVisualizations={panelVisualizations}
        setPanelVisualizations={setPanelVisualizations}
        editMode={editMode}
        pplService={pplService}
        startTime={start}
        endTime={end}
        onRefresh={onRefresh}
        cloneVisualization={cloneVisualization}
        pplFilterValue={pplFilterValue}
        showFlyout={showFlyout}
        editActionType={editActionType}
        onEditClick={onEditClick}
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});
