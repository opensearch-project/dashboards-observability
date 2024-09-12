/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure, shallow } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import { waitFor } from '@testing-library/react';
import { IntegrationUploadFlyout, IntegrationUploadPicker } from '../upload_flyout';

describe('Integration Upload Flyout', () => {
  configure({ adapter: new Adapter() });

  it('Renders integration upload flyout as expected', async () => {
    const wrapper = shallow(<IntegrationUploadFlyout onClose={() => {}} />);

    await waitFor(() => {
      expect(wrapper).toMatchSnapshot();
    });
  });

  it('Renders the clean integration picker as expected', async () => {
    const wrapper = shallow(
      <IntegrationUploadPicker
        isInvalid={true}
        setIsInvalid={(_) => {}}
        onFileSelected={(_) => {}}
      />
    );

    await waitFor(() => {
      expect(wrapper).toMatchSnapshot();
    });
  });
});
