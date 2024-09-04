/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { configure } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import { NoteTable } from '../note_table';

jest.mock('react-router-dom', () => ({
  useLocation: jest.fn().mockReturnValue({
    pathname: '/notebooks',
    search: '',
    hash: '',
    state: null,
    key: '',
  }),
  useHistory: jest.fn(),
}));

describe('<NoteTable /> spec', () => {
  configure({ adapter: new Adapter() });

  const props = {
    loading: false,
    fetchNotebooks: jest.fn(),
    addSampleNotebooks: jest.fn(),
    createNotebook: jest.fn(),
    renameNotebook: jest.fn(),
    cloneNotebook: jest.fn(),
    deleteNotebook: jest.fn(),
    parentBreadcrumb: { href: 'parent-href', text: 'parent-text' },
    setBreadcrumbs: jest.fn(),
    setToast: jest.fn(),
  };

  const renderNoteTable = (overrides = {}) => {
    const utils = render(<NoteTable {...props} {...overrides} />);
    // Additional setup or assertions if needed
    return utils;
  };

  afterEach(() => {
    cleanup(); // Cleanup the rendered component after each test
  });

  it('renders the empty component', () => {
    const utils = renderNoteTable({ notebooks: [] });
    expect(utils.container.firstChild).toMatchSnapshot();
  });

  it('renders the component', () => {
    const notebooks = Array.from({ length: 5 }, (v, k) => ({
      path: `path-${k}`,
      id: `id-${k}`,
      dateCreated: '2023-01-01 12:00:00',
      dateModified: '2023-01-02 12:00:00',
    }));
    const { getByTestId, getAllByText, ...utils } = renderNoteTable({ notebooks });
    expect(utils.container.firstChild).toMatchSnapshot();
    fireEvent.click(utils.getByText('Add sample notebooks'));
    fireEvent.click(utils.getAllByLabelText('Select this row')[0]);
    fireEvent.click(getByTestId('deleteSelectedNotebooks'));
    expect(getAllByText('Delete 1 notebook')).toHaveLength(2);
    fireEvent.click(utils.getByText('Cancel'));
    fireEvent.click(utils.getAllByLabelText('Select this row')[0]);
  });

  it('create notebook modal', async () => {
    const notebooks = Array.from({ length: 5 }, (v, k) => ({
      path: `path-${k}`,
      id: `id-${k}`,
      dateCreated: 'date-created',
      dateModified: 'date-modified',
    }));
    const utils = renderNoteTable({ notebooks });
    fireEvent.click(utils.getByText('Create notebook'));
    await waitFor(() => {
      expect(global.window.location.href).toContain('/create');
    });
  });

  it('filters notebooks based on search input', () => {
    const { getByPlaceholderText, getAllByText, queryByText } = renderNoteTable({
      notebooks: [
        {
          path: 'path-1',
          id: 'id-1',
          dateCreated: 'date-created',
          dateModified: 'date-modified',
        },
      ],
    });

    const searchInput = getByPlaceholderText('Search notebook name');
    fireEvent.change(searchInput, { target: { value: 'path-1' } });

    // Assert that only the matching notebook is displayed
    expect(getAllByText('path-1')).toHaveLength(1);
    expect(queryByText('path-0')).toBeNull();
    expect(queryByText('path-2')).toBeNull();
  });

  it('displays empty state message and create notebook button', () => {
    const { getAllByText, getAllByTestId } = renderNoteTable({ notebooks: [] });

    expect(getAllByText('No notebooks')).toHaveLength(1);

    // Create notebook using the modal
    fireEvent.click(getAllByText('Create notebook')[0]);
    fireEvent.click(getAllByTestId('custom-input-modal-input')[0]);
    fireEvent.input(getAllByTestId('custom-input-modal-input')[0], {
      target: { value: 'test-notebook' },
    });
    fireEvent.click(getAllByText('Create')[0]);
    expect(props.createNotebook).toHaveBeenCalledTimes(1);
  });

  it('deletes a notebook', () => {
    const notebooks = [
      {
        path: 'path-1',
        id: 'id-1',
        dateCreated: 'date-created',
        dateModified: 'date-modified',
      },
    ];
    const { getByLabelText, getAllByText, getByTestId } = renderNoteTable({ notebooks });

    // Select a notebook
    fireEvent.click(getByLabelText('Select this row'));

    // Click the delete button
    fireEvent.click(getByTestId('deleteSelectedNotebooks'));

    // Ensure the modal is open (you may need to adjust based on your modal implementation)
    expect(getAllByText('Delete 1 notebook')).toHaveLength(2);

    // Mock user confirmation and submit
    fireEvent.input(getByTestId('delete-notebook-modal-input'), {
      target: { value: 'delete' },
    });
    fireEvent.click(getByTestId('delete-notebook-modal-delete-button'));

    // Assert that the deleteNotebook function is called
    expect(props.deleteNotebook).toHaveBeenCalledTimes(1);
    expect(props.deleteNotebook).toHaveBeenCalledWith(['id-1'], expect.any(String));
  });

  it('adds sample notebooks', async () => {
    const { getAllByText, getByTestId } = renderNoteTable({ notebooks: [] });

    // Add samples
    fireEvent.click(getAllByText('Add sample notebooks')[0]);

    // Ensure the modal is open (you may need to adjust based on your modal implementation)
    expect(getAllByText('Add sample notebooks')).toHaveLength(3);

    // Mock user confirmation and submit
    fireEvent.click(getByTestId('confirmModalConfirmButton'));

    // Assert that the addSampleNotebooks function is called
    expect(props.addSampleNotebooks).toHaveBeenCalledTimes(1);
  });

  it('closes the delete modal', () => {
    const notebooks = [
      {
        path: 'path-1',
        id: 'id-1',
        dateCreated: 'date-created',
        dateModified: 'date-modified',
      },
    ];
    const { getByText, getByLabelText, getAllByText, getByTestId } = renderNoteTable({ notebooks });

    // Select a notebook
    fireEvent.click(getByLabelText('Select this row'));

    // Click the delete button
    fireEvent.click(getByTestId('deleteSelectedNotebooks'));

    // Ensure the modal is open
    expect(getAllByText('Delete 1 notebook')).toHaveLength(2);

    // Close the delete modal
    fireEvent.click(getByText('Cancel'));

    // Ensure the delete modal is closed
    expect(getAllByText('Delete 1 notebook')).toHaveLength(1);
  });
});
