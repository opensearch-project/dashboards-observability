/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DurationRange } from '@elastic/eui/src/components/date_picker/types';
import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import moment from 'moment';
import React from 'react';
import { PPL_DATE_FORMAT } from '../../../../../common/constants/shared';
import {
  sampleLayout,
  sampleMergedVisualizations,
  samplePanelVisualizations,
  samplePPLEmptyResponse,
  samplePPLResponse,
  sampleSavedVisualization,
  sampleSavedVisualizationForHorizontalBar,
  sampleSavedVisualizationForLine,
} from '../../../../../test/panels_constants';
import {
  displayVisualization,
  isDateValid,
  isNameValid,
  isPPLFilterValid,
  mergeLayoutAndVisualizations,
  onTimeChange,
  fetchAggregatedBinCount,
} from '../utils';
import { convertDateTime } from '../../../common/query_utils';
// eslint-disable-next-line jest/no-mocks-import
import httpClientMock from '../../../../../test/__mocks__/httpClientMock';

describe('Utils helper functions', () => {
  configure({ adapter: new Adapter() });

  it('validates isNameValid function', () => {
    expect(isNameValid('Lorem ipsum dolor sit amet, consectetur adipiscing elit,')).toBe(false);
    expect(isNameValid('Lorem ipsum dolor sit amet, consectetur adipiscin')).toBe(true);
  });

  it('validates convertDateTime function', () => {
    expect(convertDateTime('2022-01-30T18:44:40.577Z')).toBe(
      moment('2022-01-30T18:44:40.577Z').format(PPL_DATE_FORMAT)
    );
    expect(convertDateTime('2022-02-25T19:18:33.075Z', true)).toBe(
      moment('2022-02-25T19:18:33.075Z').format(PPL_DATE_FORMAT)
    );
  });

  it('validates mergeLayoutAndVisualizations function', () => {
    const setState = jest.fn();
    mergeLayoutAndVisualizations(sampleLayout, samplePanelVisualizations, setState);
    expect(setState).toHaveBeenCalledWith(sampleMergedVisualizations);
  });

  it('validates onTimeChange function', () => {
    const recentlyUsedRanges: DurationRange[] = [];
    const result = onTimeChange(
      '2022-01-30T18:44:40.577Z',
      '2022-02-25T19:18:33.075Z',
      recentlyUsedRanges
    );
    expect(result).toEqual({
      start: '2022-01-30T18:44:40.577Z',
      end: '2022-02-25T19:18:33.075Z',
      updatedRanges: [
        {
          start: '2022-01-30T18:44:40.577Z',
          end: '2022-02-25T19:18:33.075Z',
        },
      ],
    });
  });

  it('validates isDateValid function', () => {
    const setToast = jest.fn();
    expect(
      isDateValid(
        convertDateTime('2022-01-30T18:44:40.577Z'),
        convertDateTime('2022-02-25T19:18:33.075Z', false),
        setToast
      )
    ).toBe(true);
    expect(
      isDateValid(
        convertDateTime('2022-01-30T18:44:40.577Z'),
        convertDateTime('2022-01-30T18:44:40.577Z', false),
        setToast
      )
    ).toBe(true);
    expect(
      isDateValid(
        convertDateTime('2022-02-25T19:18:33.075Z'),
        convertDateTime('2022-01-30T18:44:40.577Z', false),
        setToast
      )
    ).toBe(false);
  });

  it('validates isPPLFilterValid function', () => {
    const setToast = jest.fn();
    expect(isPPLFilterValid(sampleSavedVisualization.visualization.query, setToast)).toBe(false);
    expect(isPPLFilterValid("where Carrier = 'OpenSearch-Air'", setToast)).toBe(true);
    expect(isPPLFilterValid('', setToast)).toBe(true);
  });

  it('renders displayVisualization function', () => {
    const wrapper1 = mount(
      <div>
        {displayVisualization(sampleSavedVisualization.visualization, samplePPLResponse, 'bar')}
      </div>
    );
    expect(wrapper1).toMatchSnapshot();

    const wrapper2 = mount(
      <div>{displayVisualization(sampleSavedVisualizationForLine, samplePPLResponse, 'line')}</div>
    );
    expect(wrapper2).toMatchSnapshot();

    const wrapper4 = mount(
      <div>
        {displayVisualization(
          sampleSavedVisualizationForHorizontalBar,
          samplePPLResponse,
          'horizontal_bar'
        )}
      </div>
    );
    expect(wrapper4).toMatchSnapshot();

    const wrapper6 = mount(
      <div>{displayVisualization({}, samplePPLEmptyResponse, 'horizontal_bar')}</div>
    );
    expect(wrapper6).toMatchSnapshot();
  });
});
