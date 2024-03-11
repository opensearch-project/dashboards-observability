/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import httpClientMock from '../../../../test/__mocks__/httpClientMock';
import { TraceDetailRender } from '../components/flyout_components/trace_detail_render';

describe('Trace Detail Render Flyout component', () => {
  configure({ adapter: new Adapter() });

  it('render trace detail', () => {
    const wrapper = mount(
      <TraceDetailRender
        traceId="mockTrace"
        http={httpClientMock}
        openSpanFlyout={() => {}}
        mode="jaeger"
      />
    );

    expect(wrapper).toMatchSnapshot();
  });
});
