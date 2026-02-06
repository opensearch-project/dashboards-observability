/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { CustomInputModal } from '../custom_input_modal';

describe('Custom Input Model component', () => {
  it('renders custom input modal with single argument', async () => {
    const runModal = jest.fn;
    const closeModal = jest.fn();
    const labelTxt = 'test label';
    const titletxt = 'Input test';
    const btn1txt = 'btn test';
    const btn2txt = 'btn test 2';
    render(
      <CustomInputModal
        runModal={runModal}
        closeModal={closeModal}
        labelTxt={labelTxt}
        titletxt={titletxt}
        btn1txt={btn1txt}
        btn2txt={btn2txt}
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  it('renders custom input modal with multiple arguments', async () => {
    const runModal = jest.fn;
    const closeModal = jest.fn();
    const labelTxt = 'test label';
    const titletxt = 'Input test';
    const btn1txt = 'btn test';
    const btn2txt = 'btn test 2';
    const openPanelName = 'Test Panel';
    const helpText = 'Help Text';
    const optionalArgs = ['option1', 'option2', 'option3'];
    render(
      <CustomInputModal
        runModal={runModal}
        closeModal={closeModal}
        labelTxt={labelTxt}
        titletxt={titletxt}
        btn1txt={btn1txt}
        btn2txt={btn2txt}
        openPanelName={openPanelName}
        helpText={helpText}
        optionalArgs={optionalArgs}
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});
