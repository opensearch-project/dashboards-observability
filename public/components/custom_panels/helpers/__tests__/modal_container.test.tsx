/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '@testing-library/react';
import { DeleteModal } from '../../../common/helpers/delete_modal';
import React from 'react';
import { getCloneModal, getDeleteModal } from '../modal_containers';

describe('Modal Container component', () => {
  it('renders getCloneModal function', () => {
    const onCancel = jest.fn();
    const onConfirm = jest.fn();
    render(getCloneModal(onCancel, onConfirm));
    expect(document.body).toMatchSnapshot();
  });

  it('renders getDeleteModal function', () => {
    const onCancel = jest.fn();
    const onConfirm = jest.fn();
    const title = 'Test Title';
    const message = 'Test Message';
    const confirmMessage = 'Confirm Message';
    render(getDeleteModal(onCancel, onConfirm, title, message, confirmMessage));
    expect(document.body).toMatchSnapshot();
  });

  it('renders DeleteModal component', () => {
    const onCancel = jest.fn();
    const onConfirm = jest.fn();
    const title = 'Test Title';
    const message = 'Test Message';
    render(
      <DeleteModal onCancel={onCancel} onConfirm={onConfirm} title={title} message={message} />
    );
    expect(document.body).toMatchSnapshot();
  });
});
