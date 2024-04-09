/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiCallOutProps } from '@elastic/eui';
import { render } from '@testing-library/react';
import React from 'react';
import { EmptyQueryCallOut, PPLGeneratedCallOut, ProhibitedQueryCallOut } from '../callouts';

const renderCallouts = (
  Component: React.FC,
  overrideProps: Partial<Pick<EuiCallOutProps, 'onDismiss'>> = {}
) => {
  const props: Pick<EuiCallOutProps, 'onDismiss'> = Object.assign(
    {
      onDismiss: jest.fn(),
    },
    overrideProps
  );
  const component = render(<Component {...props} />);
  return { component, props };
};

describe('Callouts spec', () => {
  test('ProhibitedQueryCallOut should match snapshot', () => {
    const { component } = renderCallouts(ProhibitedQueryCallOut);
    expect(component.container).toMatchSnapshot();
  });

  test('EmptyQueryCallOut should match snapshot', () => {
    const { component } = renderCallouts(EmptyQueryCallOut);
    expect(component.container).toMatchSnapshot();
  });

  test('PPLGeneratedCallOut should match snapshot', () => {
    const { component } = renderCallouts(PPLGeneratedCallOut);
    expect(component.container).toMatchSnapshot();
  });
});
