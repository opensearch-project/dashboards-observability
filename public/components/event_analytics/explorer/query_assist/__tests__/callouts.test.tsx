/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiCallOutProps } from '@elastic/eui';
import { render, waitFor } from '@testing-library/react';
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
  render(<Component {...props} />);
  return { props };
};

describe('Callouts spec', () => {
  test('ProhibitedQueryCallOut should match snapshot', async () => {
    renderCallouts(ProhibitedQueryCallOut);
    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  test('EmptyQueryCallOut should match snapshot', async () => {
    renderCallouts(EmptyQueryCallOut);
    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  test('PPLGeneratedCallOut should match snapshot', async () => {
    renderCallouts(PPLGeneratedCallOut);
    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});
