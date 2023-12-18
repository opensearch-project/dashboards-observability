/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import '@testing-library/jest-dom';
import { act, render, waitFor } from '@testing-library/react';
import { configure } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import { HttpResponse } from '../../../../../../../src/core/public';
import httpClientMock from '../../../../../test/__mocks__/httpClientMock';
import { addCodeBlockResponse } from '../../../../../test/notebooks_constants';
import { sampleSavedVisualization } from '../../../../../test/panels_constants';
import { emptyNotebook, sampleNotebook1 } from '../../../../../test/sampleDefaultNotebooks';
import PPLService from '../../../../services/requests/ppl';
import { SavedObjectsActions } from '../../../../services/saved_objects/saved_object_client/saved_objects_actions';
import { Notebook } from '../notebook';

jest.mock('../../../../../../../src/plugins/embeddable/public', () => ({
  ViewMode: {
    EDIT: 'edit',
    VIEW: 'view',
  },
}));

// @ts-ignore
global.fetch = jest.fn(() =>
  Promise.resolve({
    json: () =>
      Promise.resolve({
        status: {
          statuses: [{ id: 'plugin:reportsDashboards' }],
        },
      }),
  })
);

describe('<Notebook /> spec', () => {
  configure({ adapter: new Adapter() });
  const pplService = new PPLService(httpClientMock);
  const setBreadcrumbs = jest.fn();
  const renameNotebook = jest.fn();
  const cloneNotebook = jest.fn();
  const deleteNotebook = jest.fn();
  const setToast = jest.fn();
  const location = jest.fn() as any;
  location.search = '';
  const history = jest.fn() as any;
  history.replace = jest.fn();

  it('renders the empty component', async () => {
    httpClientMock.get = jest.fn(() => Promise.resolve((emptyNotebook as unknown) as HttpResponse));
    const utils = render(
      <Notebook
        pplService={pplService}
        openedNoteId="mock-id"
        DashboardContainerByValueRenderer={jest.fn()}
        http={httpClientMock}
        parentBreadcrumb={{ href: 'parent-href', text: 'parent-text' }}
        setBreadcrumbs={setBreadcrumbs}
        renameNotebook={renameNotebook}
        cloneNotebook={cloneNotebook}
        deleteNotebook={deleteNotebook}
        setToast={setToast}
        location={location}
        history={history}
      />
    );
    await waitFor(() => {
      expect(utils.getByText('sample-notebook-1')).toBeInTheDocument();
    });
    expect(utils.container.firstChild).toMatchSnapshot();
  });

  it('renders the empty component and checks code block operations', async () => {
    httpClientMock.get = jest.fn(() => Promise.resolve((emptyNotebook as unknown) as HttpResponse));
    httpClientMock.post = jest.fn(() => {
      console.log('post called');
      return Promise.resolve((addCodeBlockResponse as unknown) as HttpResponse);
    });
    const utils = render(
      <Notebook
        pplService={pplService}
        openedNoteId="mock-id"
        DashboardContainerByValueRenderer={jest.fn()}
        http={httpClientMock}
        parentBreadcrumb={{ href: 'parent-href', text: 'parent-text' }}
        setBreadcrumbs={setBreadcrumbs}
        renameNotebook={renameNotebook}
        cloneNotebook={cloneNotebook}
        deleteNotebook={deleteNotebook}
        setToast={setToast}
        location={location}
        history={history}
      />
    );
    await waitFor(() => {
      expect(utils.getByText('sample-notebook-1')).toBeInTheDocument();
    });

    act(() => {
      utils.getByText('Add code block').click();
    });

    await waitFor(() => {
      expect(
        utils.getByPlaceholderText(
          'Type %md, %sql or %ppl on the first line to define the input type. Code block starts here.'
        )
      ).toBeInTheDocument();
    });

    act(() => {
      utils.getByLabelText('Toggle show input').click();
    });

    await waitFor(() => {
      expect(
        utils.queryByPlaceholderText(
          'Type %md, %sql or %ppl on the first line to define the input type. Code block starts here.'
        )
      ).toBeNull();
    });
  });

  it('renders the component', async () => {
    SavedObjectsActions.getBulk = jest.fn().mockResolvedValue({
      observabilityObjectList: [{ savedVisualization: sampleSavedVisualization }],
    });

    httpClientMock.get = jest.fn(() =>
      Promise.resolve(({
        ...sampleNotebook1,
        path: sampleNotebook1.name,
        visualizations: [
          {
            id: 'oiuccXwBYVazWqOO1e06',
            name: 'Flight Count by Origin',
            query:
              'source=opensearch_dashboards_sample_data_flights | fields Carrier,FlightDelayMin | stats sum(FlightDelayMin) as delays by Carrier',
            type: 'bar',
            timeField: 'timestamp',
          },
        ],
        savedVisualizations: Array.from({ length: 5 }, (v, k) => ({
          label: `vis-${k}`,
          key: `vis-${k}`,
        })),
      } as unknown) as HttpResponse)
    );
    const utils = render(
      <Notebook
        pplService={pplService}
        openedNoteId={sampleNotebook1.id}
        DashboardContainerByValueRenderer={jest.fn()}
        http={httpClientMock}
        parentBreadcrumb={{ href: 'parent-href', text: 'parent-text' }}
        setBreadcrumbs={setBreadcrumbs}
        renameNotebook={renameNotebook}
        cloneNotebook={cloneNotebook}
        deleteNotebook={deleteNotebook}
        setToast={setToast}
        location={location}
        history={history}
      />
    );

    await waitFor(() => {
      expect(utils.container.firstChild).toMatchSnapshot();
    });
  });
});
