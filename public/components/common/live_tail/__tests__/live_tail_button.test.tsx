/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '@testing-library/react';
import React from 'react';
import { LiveTailButton, StopLiveButton } from '../live_tail_button';
import { waitFor } from '@testing-library/dom';

describe('Live tail button', () => {
  it('starts live tail with 5s interval', async () => {
    const setIsLiveTailPopoverOpen = jest.fn();

    const { container: _container } = render(
      <LiveTailButton
        isLiveTailOn={true}
        setIsLiveTailPopoverOpen={setIsLiveTailPopoverOpen}
        liveTailName={'5s'}
        isLiveTailPopoverOpen={false}
        dataTestSubj={''}
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  it('change live tail to 10s interval', async () => {
    const setIsLiveTailPopoverOpen = jest.fn();

    const { container: _container } = render(
      <LiveTailButton
        isLiveTailOn={true}
        setIsLiveTailPopoverOpen={setIsLiveTailPopoverOpen}
        liveTailName={'10s'}
        isLiveTailPopoverOpen={false}
        dataTestSubj={''}
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});

describe('Live tail off button', () => {
  it('stop live tail', async () => {
    const StopLive = jest.fn();

    const { container: _container } = render(
      <StopLiveButton StopLive={StopLive} dataTestSubj={''} />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});
