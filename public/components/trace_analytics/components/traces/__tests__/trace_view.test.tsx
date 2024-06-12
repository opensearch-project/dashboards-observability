/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure, shallow } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import { TraceView } from '..';
import { coreRefs } from '../../../../../framework/core_refs';

describe('Trace view component', () => {
  configure({ adapter: new Adapter() });

  it('renders trace view', () => {
    const { http, chrome } = coreRefs;
    const wrapper = shallow(
      <TraceView
        http={http!}
        chrome={chrome!}
        parentBreadcrumbs={[{ text: 'test', href: 'test#/' }]}
        traceId="test"
        mode="data_prepper"
        dataSourceMDSId={[{ id: '', label: '' }]}
        attributesFilterFields={[]}
      />
    );
    expect(wrapper).toMatchSnapshot();
  });
});
