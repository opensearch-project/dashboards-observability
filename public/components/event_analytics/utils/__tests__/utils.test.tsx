/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';

import {
  hexToRgb,
  lightenColor,
  formatError,
  isValidTraceId,
  rangeNumDocs,
  getHeaders,
  fillTimeDataWithEmpty,
  redoQuery,
} from '../utils';
import { EXPLORER_DATA_GRID_QUERY } from '../../../../../test/event_analytics_constants';

describe('Utils event analytics helper functions', () => {
  configure({ adapter: new Adapter() });

  it('validates hexToRgb function', () => {
    expect(hexToRgb()).toBe('rgba(60,161,199,1)');
    expect(hexToRgb('test', 1, true)).toBe('rgba(96,353,409,1)');
    expect(hexToRgb('#000000', 1, true)).toBe('rgba(0,0,0,1)');
  });

  it('validates lightenColor function', () => {
    expect(lightenColor('#00000', 10)).toBe('#1a1a1a');
  });

  it('validates formatError function', () => {
    expect(formatError('Warning', 'This is a warning', 'Test warning description')).toStrictEqual({
      body: {
        attributes: { error: { caused_by: { reason: 'Test warning description', type: '' } } },
      },
      message: 'This is a warning',
      name: 'Warning',
    });
  });

  it('validates isValidTraceId function', () => {
    expect(isValidTraceId('#00000')).toBe(false);
    expect(isValidTraceId('abcdefghijklmnopqrstuvwxyzabcdef')).toBe(true);
  });

  it('validates rangeNumDocs function', () => {
    expect(rangeNumDocs(11000)).toBe(10000);
    expect(rangeNumDocs(-200)).toBe(0);
    expect(rangeNumDocs(2000)).toBe(2000);
  });

  it('validates fillTimeDataWithEmpty function', () => {
    expect(
      fillTimeDataWithEmpty(
        ['2023-07-01 00:00:00', '2023-08-01 00:00:00', '2023-09-01 00:00:00'],
        [54, 802, 292],
        'M',
        '2023-01-01T08:00:00.000Z',
        '2023-09-12T21:36:31.389Z'
      )
    ).toEqual({
      buckets: [
        '2023-01-01 00:00:00',
        '2023-02-01 00:00:00',
        '2023-03-01 00:00:00',
        '2023-04-01 00:00:00',
        '2023-05-01 00:00:00',
        '2023-06-01 00:00:00',
        '2023-07-01 00:00:00',
        '2023-08-01 00:00:00',
        '2023-09-01 00:00:00',
      ],
      values: [0, 0, 0, 0, 0, 0, 54, 802, 292],
    });
    expect(
      fillTimeDataWithEmpty(
        [
          '2023-09-11 07:00:00',
          '2023-09-11 09:00:00',
          '2023-09-11 10:00:00',
          '2023-09-11 11:00:00',
          '2023-09-11 12:00:00',
          '2023-09-11 13:00:00',
          '2023-09-11 14:00:00',
          '2023-09-11 15:00:00',
        ],
        [1, 1, 5, 4, 2, 3, 3, 1],
        'h',
        '2023-09-11T00:00:00.000',
        '2023-09-11T17:00:00.000'
      )
    ).toEqual({
      buckets: [
        '2023-09-11 00:00:00',
        '2023-09-11 01:00:00',
        '2023-09-11 02:00:00',
        '2023-09-11 03:00:00',
        '2023-09-11 04:00:00',
        '2023-09-11 05:00:00',
        '2023-09-11 06:00:00',
        '2023-09-11 07:00:00',
        '2023-09-11 08:00:00',
        '2023-09-11 09:00:00',
        '2023-09-11 10:00:00',
        '2023-09-11 11:00:00',
        '2023-09-11 12:00:00',
        '2023-09-11 13:00:00',
        '2023-09-11 14:00:00',
        '2023-09-11 15:00:00',
        '2023-09-11 16:00:00',
        '2023-09-11 17:00:00',
      ],
      values: [0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 5, 4, 2, 3, 3, 1, 0, 0],
    });
  });

  it('validates redoQuery function', () => {
    const fetchEvents = jest.fn();
    const setData = jest.fn();

    redoQuery(
      '2023-01-01 00:00:00',
      '2023-09-28 23:19:10',
      "source = opensearch_dashboards_sample_data_logs | where match(request,'filebeat')",
      'timestamp',
      {
        current: [
          {
            id: 'timestamp',
            direction: 'asc',
          },
        ],
      },
      {
        current: [0, 100],
      },
      fetchEvents,
      setData
    );
    const expectedFinalQuery = {
      query:
        "source=opensearch_dashboards_sample_data_logs | where timestamp >= '2023-01-01 00:00:00' and timestamp <= '2023-09-28 23:19:10' | where match(request,'filebeat') | sort + timestamp | head 100 from 0",
    };
    // final query is the only thing being tested here
    expect(fetchEvents).toBeCalledWith(expectedFinalQuery, 'jdbc', expect.anything());
  });
});
