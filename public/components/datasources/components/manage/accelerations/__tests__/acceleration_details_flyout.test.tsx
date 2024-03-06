/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import { dummyAccelerations } from '../../../../../../../test/datasources';
import { AccelerationDetailsFlyout } from '../acceleration_details_flyout';
import { cleanup, fireEvent, render } from '@testing-library/react';

describe('Acceleration Details Flyout test', () => {
  configure({ adapter: new Adapter() });

  afterEach(() => {
    cleanup();
  });

  it('Render acceleration detail flyout', () => {
    const wrapper = mount(<AccelerationDetailsFlyout acceleration={dummyAccelerations[0]} />);

    expect(wrapper).toMatchSnapshot();
  });

  it('Render acceleration detail flyout and click on schema tab', () => {
    const utils = render(<AccelerationDetailsFlyout acceleration={dummyAccelerations[0]} />);

    fireEvent.click(utils.getByTestId('accelerationDetailsFlyoutTab_schema'));
    expect(utils.container.firstChild).toMatchSnapshot();
  });
});
