/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { waitFor } from '@testing-library/dom';
import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import toJson from 'enzyme-to-json';
import React from 'react';
import { coreMock } from '../../../../../../../../../../../src/core/public/mocks';
import { queryWorkbenchPluginCheck } from '../../../../../../../../../common/constants/shared';
import { mockDatasourcesQuery } from '../../../../../../../../../test/accelerations';
import { CreateAcceleration } from '../create_acceleration';

const coreStartMock = coreMock.createStart();

// @ts-ignore
global.fetch = jest.fn(() =>
  Promise.resolve({
    json: () =>
      Promise.resolve({
        status: {
          statuses: [{ id: queryWorkbenchPluginCheck }],
        },
      }),
  })
);

describe('Create acceleration flyout components', () => {
  configure({ adapter: new Adapter() });

  it('renders acceleration flyout component with default options', async () => {
    const selectedDatasource = 'my_glue';
    const resetFlyout = jest.fn();
    coreStartMock.http.get = jest.fn().mockResolvedValue(mockDatasourcesQuery);

    const wrapper = mount(
      <CreateAcceleration selectedDatasource={selectedDatasource} resetFlyout={resetFlyout} />
    );
    wrapper.update();
    await waitFor(() => {
      expect(
        toJson(wrapper, {
          noKey: false,
          mode: 'deep',
        })
      ).toMatchSnapshot();
    });
  });
});
