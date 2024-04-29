/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { mount, configure } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import { EuiOverlayMask, EuiConfirmModal, EuiFieldText } from '@elastic/eui';
import {
  AccelerationActionOverlay,
  AccelerationActionOverlayProps,
} from '../manage/accelerations/acceleration_action_overlay';
import { skippingIndexAcceleration } from '../../../../../test/datasources';
import { act } from 'react-dom/test-utils';

configure({ adapter: new Adapter() });

describe('AccelerationActionOverlay Component Tests', () => {
  let props: AccelerationActionOverlayProps;

  beforeEach(() => {
    props = {
      isVisible: true,
      actionType: 'delete',
      acceleration: skippingIndexAcceleration,
      dataSourceName: 'test-datasource',
      onCancel: jest.fn(),
      onConfirm: jest.fn(),
    };
  });

  it('renders correctly', () => {
    const wrapper = mount(<AccelerationActionOverlay {...props} />);
    expect(wrapper.find(EuiOverlayMask).exists()).toBe(true);
    expect(wrapper.find(EuiConfirmModal).exists()).toBe(true);
    expect(wrapper.text()).toContain('Delete acceleration');
  });

  it('calls onConfirm when confirm button is clicked and confirm is enabled', async () => {
    const wrapper = mount(<AccelerationActionOverlay {...props} />);

    if (props.actionType === 'vacuum') {
      await act(async () => {
        const onChange = wrapper.find(EuiFieldText).first().prop('onChange');
        if (typeof onChange === 'function') {
          onChange({
            target: { value: props.acceleration!.indexName },
          } as any);
        }
      });
      wrapper.update();
    }
    wrapper
      .find('button')
      .filterWhere((button) => button.text().includes('Delete'))
      .simulate('click');
    expect(props.onConfirm).toHaveBeenCalled();
  });

  it('calls onCancel when cancel button is clicked', () => {
    const wrapper = mount(<AccelerationActionOverlay {...props} />);

    wrapper
      .find('button')
      .filterWhere((button) => button.text() === 'Cancel')
      .simulate('click');

    expect(props.onCancel).toHaveBeenCalled();
  });
});
