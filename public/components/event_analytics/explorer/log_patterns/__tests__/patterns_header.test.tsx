/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { PatternsHeader } from '../patterns_header';
import { sampleLogPatternData } from '../../../../../../common/constants/explorer';

describe('Patterns header component', () => {
  it('Renders header of log patterns', async () => {
    const patternRegexInput = '[a-zA-Zd]';
    const patternsData = { patternTableData: [{ ...sampleLogPatternData }] };

    render(
      <PatternsHeader
        patternsData={patternsData}
        patternRegexInput={patternRegexInput}
        setPatternRegexInput={jest.fn()}
        onPatternApply={jest.fn()}
        setIsPatternConfigPopoverOpen={jest.fn()}
        isPatternConfigPopoverOpen={true}
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});
