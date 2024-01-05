/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import '@testing-library/jest-dom';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { configure } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import { HttpResponse } from '../../../../../../../src/core/public';
import { getOSDHttp } from '../../../../../common/utils';
import {
  addCodeBlockResponse,
  clearOutputNotebook,
  codeBlockNotebook,
  codePlaceholderText,
  notebookPutResponse,
  runCodeBlockResponse,
} from '../../../../../test/notebooks_constants';
import { sampleSavedVisualization } from '../../../../../test/panels_constants';
import { emptyNotebook, sampleNotebook1 } from '../../../../../test/sample_default_notebooks';
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
  const httpClient = getOSDHttp();
  const pplService = new PPLService(httpClient);
  const setBreadcrumbs = jest.fn();
  const renameNotebook = jest.fn();
  const cloneNotebook = jest.fn();
  const deleteNotebook = jest.fn();
  const setToast = jest.fn();
  const location = jest.fn() as any;
  location.search = '';
  const history = jest.fn() as any;
  history.replace = jest.fn();

  it('renders the empty component and test reporting action button', async () => {
    httpClient.get = jest.fn(() => Promise.resolve((emptyNotebook as unknown) as HttpResponse));
    const utils = render(
      <Notebook
        pplService={pplService}
        openedNoteId="mock-id"
        DashboardContainerByValueRenderer={jest.fn()}
        http={httpClient}
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

    act(() => {
      fireEvent.click(utils.getByText('Reporting actions'));
    });

    expect(utils.queryByTestId('download-notebook-pdf')).toBeInTheDocument();

    act(() => {
      fireEvent.click(utils.getByText('Reporting actions'));
    });

    await waitFor(() => {
      expect(utils.queryByTestId('download-notebook-pdf')).toBeNull();
    });
  });

  it('renders the empty component and checks code block operations', async () => {
    httpClient.get = jest.fn(() => Promise.resolve((emptyNotebook as unknown) as HttpResponse));
    let postFlag = 1;
    httpClient.post = jest.fn(() => {
      if (postFlag === 1) {
        postFlag += 1;
        return Promise.resolve((addCodeBlockResponse as unknown) as HttpResponse);
      } else return Promise.resolve((runCodeBlockResponse as unknown) as HttpResponse);
    });
    const utils = render(
      <Notebook
        pplService={pplService}
        openedNoteId="mock-id"
        DashboardContainerByValueRenderer={jest.fn()}
        http={httpClient}
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
      expect(utils.getByPlaceholderText(codePlaceholderText)).toBeInTheDocument();
    });

    act(() => {
      utils.getByLabelText('Toggle show input').click();
    });

    await waitFor(() => {
      expect(utils.queryByPlaceholderText(codePlaceholderText)).toBeNull();
    });

    act(() => {
      utils.getByLabelText('Toggle show input').click();
    });

    act(() => {
      fireEvent.input(utils.getByPlaceholderText(codePlaceholderText), {
        target: { value: '%md \\n hello' },
      });
      fireEvent.click(utils.getByText('Run'));
    });

    await waitFor(() => {
      expect(utils.queryByText('Run')).toBeNull();
      expect(utils.getByText('hello')).toBeInTheDocument();
    });

    act(() => {
      fireEvent.click(utils.getByTestId('input_only'));
    });

    await waitFor(() => {
      expect(utils.queryByText('Refresh')).toBeInTheDocument();
    });

    act(() => {
      fireEvent.click(utils.getByTestId('output_only'));
    });

    await waitFor(() => {
      expect(utils.queryByText('Refresh')).toBeNull();
      expect(utils.getByText('hello')).toBeInTheDocument();
    });
  });

  it('renders a notebook and checks paragraph actions', async () => {
    httpClient.get = jest.fn(() => Promise.resolve((codeBlockNotebook as unknown) as HttpResponse));
    httpClient.put = jest.fn(() =>
      Promise.resolve((clearOutputNotebook as unknown) as HttpResponse)
    );
    httpClient.delete = jest.fn(() =>
      Promise.resolve(({ paragraphs: [] } as unknown) as HttpResponse)
    );

    const utils = render(
      <Notebook
        pplService={pplService}
        openedNoteId="mock-id"
        DashboardContainerByValueRenderer={jest.fn()}
        http={httpClient}
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
      fireEvent.click(utils.getByText('Paragraph actions'));
    });

    act(() => {
      fireEvent.click(utils.getByText('Clear all outputs'));
    });

    await waitFor(() => {
      expect(
        utils.queryByText(
          'Are you sure you want to clear all outputs? The action cannot be undone.'
        )
      ).toBeInTheDocument();
    });

    act(() => {
      fireEvent.click(utils.getByTestId('confirmModalConfirmButton'));
    });

    await waitFor(() => {
      expect(utils.queryByText('hello')).toBeNull();
    });

    act(() => {
      fireEvent.click(utils.getByText('Paragraph actions'));
    });

    act(() => {
      fireEvent.click(utils.getByText('Delete all paragraphs'));
    });

    await waitFor(() => {
      expect(
        utils.queryByText(
          'Are you sure you want to delete all paragraphs? The action cannot be undone.'
        )
      ).toBeInTheDocument();
    });

    act(() => {
      fireEvent.click(utils.getByTestId('confirmModalConfirmButton'));
    });

    await waitFor(() => {
      expect(utils.queryByText('No paragraphs')).toBeInTheDocument();
    });
  });

  it('renders a notebook and checks notebook actions', async () => {
    const renameNotebookMock = jest.fn(() =>
      Promise.resolve((notebookPutResponse as unknown) as HttpResponse)
    );
    const cloneNotebookMock = jest.fn(() => Promise.resolve('dummy-string'));
    httpClient.get = jest.fn(() => Promise.resolve((codeBlockNotebook as unknown) as HttpResponse));

    httpClient.put = jest.fn(() => {
      return Promise.resolve((notebookPutResponse as unknown) as HttpResponse);
    });

    httpClient.post = jest.fn(() => {
      return Promise.resolve((addCodeBlockResponse as unknown) as HttpResponse);
    });

    const utils = render(
      <Notebook
        pplService={pplService}
        openedNoteId="mock-id"
        DashboardContainerByValueRenderer={jest.fn()}
        http={httpClient}
        parentBreadcrumb={{ href: 'parent-href', text: 'parent-text' }}
        setBreadcrumbs={setBreadcrumbs}
        renameNotebook={renameNotebookMock}
        cloneNotebook={cloneNotebookMock}
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
      fireEvent.click(utils.getByText('Notebook actions'));
    });

    act(() => {
      fireEvent.click(utils.getByText('Rename notebook'));
    });

    await waitFor(() => {
      expect(utils.queryByTestId('custom-input-modal-input')).toBeInTheDocument();
    });

    act(() => {
      fireEvent.input(utils.getByTestId('custom-input-modal-input'), {
        target: { value: 'test-notebook-newname' },
      });
      fireEvent.click(utils.getByTestId('custom-input-modal-confirm-button'));
    });

    await waitFor(() => {
      expect(renameNotebookMock).toHaveBeenCalledTimes(1);
    });

    act(() => {
      fireEvent.click(utils.getByText('Notebook actions'));
    });

    act(() => {
      fireEvent.click(utils.getByText('Duplicate notebook'));
    });

    await waitFor(() => {
      expect(utils.queryByTestId('custom-input-modal-input')).toBeInTheDocument();
    });

    act(() => {
      fireEvent.click(utils.getByTestId('custom-input-modal-confirm-button'));
    });

    expect(cloneNotebookMock).toHaveBeenCalledTimes(1);

    act(() => {
      fireEvent.click(utils.getByText('Notebook actions'));
    });

    act(() => {
      fireEvent.click(utils.getByText('Delete notebook'));
    });

    await waitFor(() => {
      expect(utils.queryByTestId('delete-notebook-modal-input')).toBeInTheDocument();
    });

    act(() => {
      fireEvent.input(utils.getByTestId('delete-notebook-modal-input'), {
        target: { value: 'delete' },
      });
    });

    act(() => {
      fireEvent.click(utils.getByTestId('delete-notebook-modal-delete-button'));
    });

    expect(deleteNotebook).toHaveBeenCalledTimes(1);
  });

  it('renders the visualization component', async () => {
    SavedObjectsActions.getBulk = jest.fn().mockResolvedValue({
      observabilityObjectList: [{ savedVisualization: sampleSavedVisualization }],
    });

    httpClient.get = jest.fn(() =>
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
        http={httpClient}
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
