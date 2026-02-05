/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import {
  DeleteNotebookModal,
  getCloneModal,
  getCustomModal,
  getDeleteModal,
  getSampleNotebooksModal,
} from '../modal_containers';

describe('modal_containers spec', () => {
  it('render get custom modal', () => {
    const runModal = jest.fn();
    const closeModal = jest.fn();
    render(
      getCustomModal(
        runModal,
        closeModal,
        'label',
        'title',
        'Cancel',
        'Confirm',
        'mock-path',
        'help text'
      )
    );
    expect(document.body).toMatchSnapshot();
  });

  it('render get clone modal', () => {
    const onCancel = jest.fn();
    const onConfirm = jest.fn();
    render(getCloneModal(onCancel, onConfirm));
    expect(document.body).toMatchSnapshot();
  });

  it('render get sample notebooks modal', () => {
    const onCancel = jest.fn();
    const onConfirm = jest.fn();
    render(getSampleNotebooksModal(onCancel, onConfirm));
    expect(document.body).toMatchSnapshot();
  });

  it('render get delete modal', () => {
    const onCancel = jest.fn();
    const onConfirm = jest.fn();
    render(getDeleteModal(onCancel, onConfirm, 'Delete', 'Delete message', 'Confirm message'));
    expect(document.body).toMatchSnapshot();

    const { container: noConfirmMessageContainer } = render(
      getDeleteModal(onCancel, onConfirm, 'Delete', 'Delete message')
    );
    expect(noConfirmMessageContainer).toMatchSnapshot();
  });

  it('render delete notebooks modal', () => {
    const onCancel = jest.fn();
    const onConfirm = jest.fn();
    render(
      <DeleteNotebookModal
        onConfirm={onConfirm}
        onCancel={onCancel}
        title="title"
        message="message"
      />
    );
    expect(document.body).toMatchSnapshot();
  });

  it('checks delete notebooks modal', () => {
    const onCancel = jest.fn();
    const onConfirm = jest.fn();
    const utils = render(
      <DeleteNotebookModal
        onConfirm={onConfirm}
        onCancel={onCancel}
        title="title"
        message="message"
      />
    );
    fireEvent.change(utils.getAllByTestId('delete-notebook-modal-input')[0], {
      target: { value: 'delete' },
    });
    fireEvent.click(utils.getAllByTestId('delete-notebook-modal-delete-button')[0]);
    expect(onConfirm).toBeCalled();
  });
});
