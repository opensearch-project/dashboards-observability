/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import {
  testPrometheusConnectionDetails,
  testS3ConnectionDetails,
} from '../../../../../test/datasources';
import { ConnectionDetails } from '../manage/connection_details';

describe('Connection Details test', () => {
  configure({ adapter: new Adapter() });

  it('Renders connection details for s3 datasource', async () => {
    const wrapper = mount(<ConnectionDetails {...testS3ConnectionDetails} />);

    expect(wrapper).toMatchSnapshot();
  });

  it('Renders connection details for prometheus datasource', async () => {
    const wrapper = mount(<ConnectionDetails {...testPrometheusConnectionDetails} />);

    expect(wrapper).toMatchSnapshot();
  });
});
