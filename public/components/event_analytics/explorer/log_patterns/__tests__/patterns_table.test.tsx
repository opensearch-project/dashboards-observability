/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { htmlIdGenerator } from '@elastic/eui';
import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import { waitFor } from '@testing-library/react';
import { PatternsTable } from '../patterns_table';
import {
  FINAL_QUERY,
  RAW_QUERY,
  INDEX,
  SELECTED_DATE_RANGE,
  SELECTED_TIMESTAMP,
  sampleLogPatternData,
} from '../../../../../../common/constants/explorer';

describe('Pattern table component', () => {
  configure({ adapter: new Adapter() });

  it('Renders pattern table', async () => {
    const tableData = [
      {
        ...sampleLogPatternData,
      },
    ];

    const query = {
      [RAW_QUERY]:
        "source = opensearch_dashboards_sample_data_logs | where match(request,'filebeat')",
      [FINAL_QUERY]:
        "source=opensearch_dashboards_sample_data_logs | where timestamp >= '2023-01-01 08:00:00' and timestamp <= '2023-02-27 19:25:35' \
         | where match(request,'filebeat') | patterns pattern='[a-z\\d]' `message` | where patterns_field='... - - [--T::.Z] \"GET ///-..--_.._ HTTP/.\"   \"-\" \"M/. (X; L _; :.) G/ F/.\"'\
          | patterns pattern='[a-z\\d]' `message`  | stats count(), take(`message`, 1) by patterns_field",
      [INDEX]: '',
      [SELECTED_DATE_RANGE]: ['now/y', 'now'],
      [SELECTED_TIMESTAMP]: 'timestamp',
    };

    const wrapper = mount(
      <PatternsTable
        isPatternLoading={false}
        onPatternSelection={jest.fn()}
        query={query}
        tabId={htmlIdGenerator()()}
        tableData={tableData}
      />
    );

    wrapper.update();

    await waitFor(() => {
      expect(wrapper).toMatchSnapshot();
    });
  });
});
