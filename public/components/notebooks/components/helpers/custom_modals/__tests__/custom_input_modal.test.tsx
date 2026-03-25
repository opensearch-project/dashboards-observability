/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import { CustomInputModal } from '../custom_input_modal';

describe('<CustomInputModal /> spec', () => {
  it('renders the component', () => {
    const runModal = jest.fn();
    const closeModal = jest.fn();
    render(
      <CustomInputModal
        runModal={runModal}
        closeModal={closeModal}
        labelTxt="label"
        titletxt="title"
        btn1txt="Cancel"
        btn2txt="Confirm"
        openNoteName="mock-path"
        helpText="help text"
      />
    );
    expect(document.body).toMatchSnapshot();

    const { container: emptyNameContainer } = render(
      <CustomInputModal
        runModal={runModal}
        closeModal={closeModal}
        labelTxt="label"
        titletxt="title"
        btn1txt="Cancel"
        btn2txt="Confirm"
        openNoteName=""
        helpText="help text"
      />
    );
    expect(emptyNameContainer).toMatchSnapshot();
  });

  it('clicks buttons', () => {
    const runModal = jest.fn();
    const closeModal = jest.fn();
    const utils = render(
      <CustomInputModal
        runModal={runModal}
        closeModal={closeModal}
        labelTxt="label"
        titletxt="title"
        btn1txt="Cancel"
        btn2txt="Confirm"
        openNoteName="mock-path"
        helpText="help text"
      />
    );
    fireEvent.change(utils.getByTestId('custom-input-modal-input'), {
      target: { value: 'test-name' },
    });
    utils.getByTestId('custom-input-modal-confirm-button').click();
    expect(runModal).toBeCalledWith('test-name');
  });
});
