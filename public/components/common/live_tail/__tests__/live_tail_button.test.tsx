/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { waitFor } from '@testing-library/dom';
import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import toJson from 'enzyme-to-json';
import React from 'react';
import { LiveTailButton, StopLiveButton } from '../live_tail_button';

describe('Live tail button', () => {
  configure({ adapter: new Adapter() });

  it('starts live tail with 5s interval', async () => {
    const setIsLiveTailPopoverOpen = jest.fn();

    const wrapper = mount(
      <LiveTailButton
        isLiveTailOn={true}
        setIsLiveTailPopoverOpen={setIsLiveTailPopoverOpen}
        liveTailName={'5s'}
        isLiveTailPopoverOpen={false}
        dataTestSubj={''}
      />
    );

    wrapper.update();

    await waitFor(() => {
      expect(
        toJson(wrapper, {
          mode: 'deep',
        })
      ).toMatchSnapshot();
    });
  });

  it('change live tail to 10s interval', async () => {
    const setIsLiveTailPopoverOpen = jest.fn();

    const wrapper = mount(
      <LiveTailButton
        isLiveTailOn={true}
        setIsLiveTailPopoverOpen={setIsLiveTailPopoverOpen}
        liveTailName={'10s'}
        isLiveTailPopoverOpen={false}
        dataTestSubj={''}
      />
    );

    wrapper.update();

    await waitFor(() => {
      expect(
        toJson(wrapper, {
          mode: 'deep',
        })
      ).toMatchSnapshot();
    });
  });
});

describe('Live tail off button', () => {
  configure({ adapter: new Adapter() });

  it('stop live tail', async () => {
    const StopLive = jest.fn();

    const wrapper = mount(<StopLiveButton StopLive={StopLive} dataTestSubj={''} />);

    wrapper.update();

    await waitFor(() => {
      expect(
        toJson(wrapper, {
          mode: 'deep',
        })
      ).toMatchSnapshot();
    });
  });
});
