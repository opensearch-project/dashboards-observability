/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import { waitFor } from '@testing-library/react';
import { AvailableIntegrationsCardView } from '../available_integration_card_view';
import { availableCardViewData } from './testing_constants';
import React from 'react';

describe('Available Integration Card View Test', () => {
  configure({ adapter: new Adapter() });

  it('Renders nginx integration card view using dummy data', async () => {
    const wrapper = mount(<AvailableIntegrationsCardView {...availableCardViewData} />);

    await waitFor(() => {
      expect(wrapper).toMatchSnapshot();
    });
  });
});
