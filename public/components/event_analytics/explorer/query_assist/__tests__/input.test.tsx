/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, waitFor } from '@testing-library/react';
import React, { ComponentProps } from 'react';
import { Provider } from 'react-redux';
import { coreMock } from '../../../../../../../../src/core/public/mocks';
import { ERROR_DETAILS, QUERY_ASSIST_API } from '../../../../../../common/constants/query_assist';
import * as coreServices from '../../../../../../common/utils/core_services';
import { coreRefs } from '../../../../../framework/core_refs';
import { rootReducer } from '../../../../../framework/redux/reducers';
import { initialTabId } from '../../../../../framework/redux/store/shared_state';
import { PPLGeneratedCallOut, ProhibitedQueryCallOut } from '../callouts';
import { QueryAssistInput } from '../input';

const renderQueryAssistInput = (
  overrideProps: Partial<ComponentProps<typeof QueryAssistInput>> = {}
) => {
  const preloadedState = {};
  const store = configureStore({ reducer: rootReducer, preloadedState });
  const props: jest.Mocked<ComponentProps<typeof QueryAssistInput>> = Object.assign<
    ComponentProps<typeof QueryAssistInput>,
    Partial<ComponentProps<typeof QueryAssistInput>>
  >(
    {
      handleQueryChange: jest.fn(),
      handleTimeRangePickerRefresh: jest.fn(),
      tabId: initialTabId,
      setNeedsUpdate: jest.fn(),
      selectedIndex: [{ label: 'selected-test-index' }],
      nlqInput: 'test-input',
      setNlqInput: jest.fn(),
      callOut: null,
      setCallOut: jest.fn(),
      handleTimePickerChange: jest.fn(),
    },
    overrideProps
  );
  const component = render(
    <Provider store={store}>
      <QueryAssistInput {...props} />
    </Provider>
  );
  return { component, props, store };
};

describe('<QueryAssistInput /> spec', () => {
  const coreStartMock = coreMock.createStart();
  coreRefs.toasts = coreStartMock.notifications.toasts;
  const httpMock = coreStartMock.http;

  beforeEach(() => {
    jest.spyOn(coreServices, 'getOSDHttp').mockReturnValue(httpMock);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should call generate ppl based on nlq input value', async () => {
    httpMock.post.mockResolvedValueOnce('source = index');

    const { component, props } = renderQueryAssistInput();

    await waitFor(() => {
      // splitbutton data-test-subj doesn't work in Oui 1.5, this should be query-assist-generate-and-run-button
      fireEvent.click(component.getByText('Generate and run'));
    });

    expect(httpMock.post).toBeCalledWith(QUERY_ASSIST_API.GENERATE_PPL, {
      body: '{"question":"test-input","index":"selected-test-index"}',
    });
    expect(props.handleQueryChange).toBeCalledWith('source = index');
    expect(props.setCallOut.mock.calls[0][0]).toBeNull();
    expect(props.setCallOut.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        type: PPLGeneratedCallOut,
      })
    );
  });

  it.skip('should display toast for generate errors', async () => {
    httpMock.post.mockRejectedValueOnce({ body: { statusCode: 429 } });

    const { component } = renderQueryAssistInput();
    await waitFor(() => {
      // splitbutton dropdown buttons don't support custom test id in Oui 1.5
      fireEvent.click(component.getByTestId('splitButton--dropdown'));
      fireEvent.click(component.getByTestId('query-assist-generate-button'));
    });

    expect(coreRefs.toasts!.addError).toBeCalledWith(
      {
        message: 'Request is throttled. Try again later or contact your administrator',
        statusCode: 429,
      },
      { title: 'Failed to generate results' }
    );
  });

  it('should call add error toast if summarize is disabled', async () => {
    coreRefs.summarizeEnabled = false;
    httpMock.post.mockRejectedValueOnce({ body: { statusCode: 429 } });

    const { component } = renderQueryAssistInput();
    await waitFor(() => {
      // splitbutton data-test-subj doesn't work in Oui 1.5, this should be query-assist-generate-and-run-button
      fireEvent.click(component.getByText('Generate and run'));
    });

    expect(httpMock.post).toBeCalledWith(QUERY_ASSIST_API.GENERATE_PPL, {
      body: '{"question":"test-input","index":"selected-test-index"}',
    });
    expect(httpMock.post).not.toBeCalledWith(QUERY_ASSIST_API.SUMMARIZE, expect.anything());
    expect(coreRefs.toasts?.addError).toBeCalledWith(
      {
        message: 'Request is throttled. Try again later or contact your administrator',
        statusCode: 429,
      },
      { title: 'Failed to generate results' }
    );
  });

  it('should call summarize for generate and run errors', async () => {
    coreRefs.summarizeEnabled = true;
    httpMock.post.mockRejectedValueOnce({ body: { statusCode: 429 } }).mockResolvedValueOnce({
      summary: 'too many requests',
      suggestedQuestions: ['1', '2'],
    });

    const { component } = renderQueryAssistInput();
    await waitFor(() => {
      // splitbutton data-test-subj doesn't work in Oui 1.5, this should be query-assist-generate-and-run-button
      fireEvent.click(component.getByText('Generate and run'));
    });

    expect(httpMock.post).toBeCalledWith(QUERY_ASSIST_API.GENERATE_PPL, {
      body: '{"question":"test-input","index":"selected-test-index"}',
    });
    expect(httpMock.post).toBeCalledWith(QUERY_ASSIST_API.SUMMARIZE, {
      body:
        '{"question":"test-input","index":"selected-test-index","isError":true,"query":"","response":"{\\"statusCode\\":429,\\"message\\":\\"Request is throttled. Try again later or contact your administrator\\"}"}',
    });
  });

  it('should display callout when response returned 400 with guardrails denied', async () => {
    coreRefs.summarizeEnabled = true;
    httpMock.post.mockRejectedValueOnce({
      body: { statusCode: 400, message: ERROR_DETAILS.GUARDRAILS_TRIGGERED },
    });

    const { component, props } = renderQueryAssistInput();
    await waitFor(() => {
      // splitbutton data-test-subj doesn't work in Oui 1.5, this should be query-assist-generate-and-run-button
      fireEvent.click(component.getByText('Generate and run'));
    });

    expect(httpMock.post).toBeCalledWith(QUERY_ASSIST_API.GENERATE_PPL, {
      body: '{"question":"test-input","index":"selected-test-index"}',
    });
    expect(props.setCallOut.mock.calls[0][0]).toBeNull();
    expect(props.setCallOut.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        type: ProhibitedQueryCallOut,
      })
    );
  });
});
