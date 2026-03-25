/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { TimechartHeader } from '../timechart_header';
import { TIME_INTERVAL_OPTIONS } from '../../../../../../../common/constants/explorer';
import {
  EXPLORER_START_TIME,
  EXPLORER_END_TIME,
} from '../../../../../../../test/event_analytics_constants';

describe('Time chart header component', () => {
  it('Renders Time chart header component', async () => {
    const onChangeInterval = jest.fn();

    render(
      <TimechartHeader
        onChangeInterval={onChangeInterval}
        options={TIME_INTERVAL_OPTIONS}
        stateInterval="w"
        startTime={EXPLORER_START_TIME}
        endTime={EXPLORER_END_TIME}
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});
