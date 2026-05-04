/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render } from '@testing-library/react';

const mockSetOption = jest.fn();
const mockResize = jest.fn();
const mockDispose = jest.fn();

jest.mock('echarts', () => ({
  init: jest.fn(() => ({
    setOption: mockSetOption,
    resize: mockResize,
    dispose: mockDispose,
  })),
}));

// Mock ResizeObserver (jsdom doesn't have it)
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  disconnect: jest.fn(),
  unobserve: jest.fn(),
}));

import { EchartsRender } from '../echarts_render';

describe('EchartsRender', () => {
  it('renders a container div with specified height', () => {
    const { container } = render(<EchartsRender spec={{}} height={300} />);
    const div = container.firstChild as HTMLElement;
    expect(div.style.height).toBe('300px');
    expect(div.style.width).toBe('100%');
  });

  it('calls setOption with the spec', () => {
    const spec = { series: [{ type: 'line', data: [1, 2] }] };
    render(<EchartsRender spec={spec} />);
    expect(mockSetOption).toHaveBeenCalledWith(spec, { notMerge: true });
  });
});
