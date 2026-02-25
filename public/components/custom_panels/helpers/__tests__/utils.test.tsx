/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DurationRange } from '@elastic/eui/src/components/date_picker/types';
import { render } from '@testing-library/react';
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
    const { container: container1 } = render(
      <div>
        {displayVisualization(sampleSavedVisualization.visualization, samplePPLResponse, 'bar')}
      </div>
    );
    expect(container1).toMatchSnapshot();

    const { container: container2 } = render(
      <div>{displayVisualization(sampleSavedVisualizationForLine, samplePPLResponse, 'line')}</div>
    );
    expect(container2).toMatchSnapshot();

    const { container: container4 } = render(
      <div>
        {displayVisualization(
          sampleSavedVisualizationForHorizontalBar,
          samplePPLResponse,
          'horizontal_bar'
        )}
      </div>
    );
    expect(container4).toMatchSnapshot();

    const { container: container6 } = render(
      <div>{displayVisualization({}, samplePPLEmptyResponse, 'horizontal_bar')}</div>
    );
    expect(container6).toMatchSnapshot();
  });

  it('validates fetchAggregatedBinCount function', () => {
    httpClientMock.post = jest.fn().mockReturnValue('dummy response');
    const setIsError = jest.fn();
    const setIsLoading = jest.fn();

    fetchAggregatedBinCount('', '', 'now', 'now', '', '', setIsError, setIsLoading);
    expect(httpClientMock.post).toHaveBeenCalledTimes(1);
  });
});
