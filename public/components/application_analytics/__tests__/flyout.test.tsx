/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render } from '@testing-library/react';
// eslint-disable-next-line jest/no-mocks-import
import httpClientMock from '../../../../test/__mocks__/httpClientMock';
import { TraceDetailRender } from '../components/flyout_components/trace_detail_render';

describe('Trace Detail Render Flyout component', () => {
  it('render trace detail', () => {
    render(
      <TraceDetailRender
        traceId="mockTrace"
        http={httpClientMock}
        openSpanFlyout={() => {}}
        mode="jaeger"
      />
    );

    expect(document.body).toMatchSnapshot();
  });
});
