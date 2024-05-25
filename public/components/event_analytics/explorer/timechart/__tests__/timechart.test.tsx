/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render } from '@testing-library/react';
import React, { ComponentProps } from 'react';
import { Timechart } from '../timechart';

const renderTimechart = (overrideProps: Partial<ComponentProps<typeof Timechart>> = {}) => {
  const props: jest.Mocked<ComponentProps<typeof Timechart>> = Object.assign<
    ComponentProps<typeof Timechart>,
    Partial<ComponentProps<typeof Timechart>>
  >(
    {
      countDistribution: {
        selectedInterval: 'y',
        data: { 'count()': [194], 'span(timestamp,1y)': ['2024-01-01 00:00:00'] },
        metadata: {
          fields: [
            { name: 'count()', type: 'integer' },
            { name: 'span(timestamp,1y)', type: 'timestamp' },
          ],
        },
        size: 1,
        status: 200,
        jsonData: [{ 'count()': 194, 'span(timestamp,1y)': '2024-01-01 00:00:00' }],
      },
      timeIntervalOptions: [
        { text: 'Minute', value: 'm' },
        { text: 'Hour', value: 'h' },
        { text: 'Day', value: 'd' },
        { text: 'Week', value: 'w' },
        { text: 'Month', value: 'M' },
        { text: 'Year', value: 'y' },
      ],
      onChangeInterval: jest.fn(),
      selectedInterval: 'y',
      startTime: '2024-01-01 00:00:00',
      endTime: '2024-01-01 00:00:00',
    },
    overrideProps
  );
  const component = render(<Timechart {...props} />);
  return { component, props };
};

describe('<Timechart /> spec', () => {
  it('should change to week', () => {
    const { component, props } = renderTimechart();
    fireEvent.change(component.getByTestId('eventAnalytics__EventIntervalSelect'), {
      target: { value: 'w' },
    });
    expect(props.onChangeInterval).toBeCalledWith('w');
  });

  it('should match snapshot', () => {
    const { component } = renderTimechart();
    expect(component.container).toMatchSnapshot();
  });
});
