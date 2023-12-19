/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { waitFor } from '@testing-library/react';
import { AgGridReact } from 'ag-grid-react';
import { configure, shallow } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import toJson from 'enzyme-to-json';
import React from 'react';
import { TEST_VISUALIZATIONS_DATA } from '../../../../../test/event_analytics_constants';
import { DataTable } from '../data_table/data_table';

describe('Data table component', () => {
  configure({ adapter: new Adapter() });

  it('Renders data table component', async () => {
    const gridWrapper = shallow(<DataTable visualizations={TEST_VISUALIZATIONS_DATA} />);
    const agGridReactObj = gridWrapper.find(AgGridReact);
    agGridReactObj.simulate('gridReady');
    expect(agGridReactObj).toBeTruthy();
    await waitFor(() => {
      expect(
        toJson(wrapper, {
          mode: 'deep',
        })
      ).toMatchSnapshot();
    });
  });
});
