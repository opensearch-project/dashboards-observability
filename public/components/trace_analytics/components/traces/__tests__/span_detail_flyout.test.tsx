/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { waitFor } from '@testing-library/react';
import { render } from '@testing-library/react';
import React from 'react';
import { HttpResponse } from '../../../../../../../../src/core/public';
import { TEST_SPAN_RESPONSE } from '../../../../../../test/constants';
// eslint-disable-next-line jest/no-mocks-import
import httpClientMock from '../../../../../../test/__mocks__/httpClientMock';
import { SpanDetailFlyout, flattenObject } from '../span_detail_flyout';

describe('<SpanDetailFlyout /> spec', () => {
  it('renders the empty component', async () => {
    httpClientMock.post = jest.fn(() =>
      Promise.resolve(({ hits: { hits: [], total: { value: 0 } } } as unknown) as HttpResponse)
    );
    const closeFlyout = jest.fn();
    const addSpanFilter = jest.fn();
    render(
      <SpanDetailFlyout
        http={httpClientMock}
        spanId="test"
        isFlyoutVisible={true}
        closeFlyout={closeFlyout}
        addSpanFilter={addSpanFilter}
        mode="data_prepper"
      />
    );
    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  it('renders the component with data', async () => {
    httpClientMock.post = jest.fn(() =>
      Promise.resolve((TEST_SPAN_RESPONSE as unknown) as HttpResponse)
    );
    const closeFlyout = jest.fn();
    const addSpanFilter = jest.fn();

    render(
      <SpanDetailFlyout
        http={httpClientMock}
        spanId="test"
        isFlyoutVisible={true}
        closeFlyout={closeFlyout}
        addSpanFilter={addSpanFilter}
        mode="data_prepper"
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});

describe('flattenObject', () => {
  it('flattens a simple nested object', () => {
    const input = {
      a: {
        b: 1,
        c: { d: 2 },
      },
      e: 3,
    };

    const expected = {
      'a.b': 1,
      'a.c.d': 2,
      e: 3,
    };

    expect(flattenObject(input)).toEqual(expected);
  });

  it('treats arrays as values without recursing into them', () => {
    const input = {
      arr: [1, 2],
      nested: {
        x: [3, 4],
        y: { z: 5 },
      },
    };

    const expected = {
      arr: [1, 2],
      'nested.x': [3, 4],
      'nested.y.z': 5,
    };

    expect(flattenObject(input)).toEqual(expected);
  });

  it('flattens a sample span _source object with multiple levels of nesting', () => {
    const sample = {
      traceId: '005cf53c07193a497fae2aa9ebedb8d3',
      instrumentationScope: {
        name: '@opentelemetry/instrumentation-http',
        version: '0.57.1',
      },
      resource: {
        attributes: {
          'service.name': 'frontend',
          'host.name': '1e4c87e3bcaf',
        },
      },
      attributes: {
        'http.method': 'GET',
        nested: {
          deep: true,
        },
      },
    };

    const actual = flattenObject(sample);
    const expected = {
      traceId: '005cf53c07193a497fae2aa9ebedb8d3',
      'instrumentationScope.name': '@opentelemetry/instrumentation-http',
      'instrumentationScope.version': '0.57.1',
      'resource.attributes.service.name': 'frontend',
      'resource.attributes.host.name': '1e4c87e3bcaf',
      'attributes.http.method': 'GET',
      'attributes.nested.deep': true,
    };

    expect(actual).toEqual(expected);
  });
});
