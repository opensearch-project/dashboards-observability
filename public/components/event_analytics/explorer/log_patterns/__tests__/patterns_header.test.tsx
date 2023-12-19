/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { waitFor } from '@testing-library/react';
import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import toJson from 'enzyme-to-json';
import React from 'react';
import { sampleLogPatternData } from '../../../../../../common/constants/explorer';
import { PatternsHeader } from '../patterns_header';

describe('Patterns header component', () => {
  configure({ adapter: new Adapter() });

  it('Renders header of log patterns', async () => {
    const patternRegexInput = '[a-zA-Zd]';
    const patternsData = { patternTableData: [{ ...sampleLogPatternData }] };

    const wrapper = mount(
      <PatternsHeader
        patternsData={patternsData}
        patternRegexInput={patternRegexInput}
        setPatternRegexInput={jest.fn()}
        onPatternApply={jest.fn()}
        setIsPatternConfigPopoverOpen={jest.fn()}
        isPatternConfigPopoverOpen={true}
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
