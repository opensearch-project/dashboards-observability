/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import { ObservabilityErrorBoundary } from '../observability_error_boundary';

describe('Traces table component', () => {
  configure({ adapter: new Adapter() });

  it('renders empty traces table message', () => {
    const BadComponent = () => {
      throw new Error('Testing Observability Error Boundary');
    };
    const errorScreen = mount(
      <ObservabilityErrorBoundary>
        <BadComponent />
      </ObservabilityErrorBoundary>
    );
    expect(errorScreen.text()).toContain(
      'An unexpected error occurred. Please refresh the page, and if the issue persists, report it by creating an issue on'
    );
  });
});
