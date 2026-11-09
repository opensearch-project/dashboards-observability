/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import { TabRowActions, TabRowActionsProvider } from '../tab_row_actions';

const Page: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  return (
    <>
      <div ref={setSlot} data-test-subj="slot" />
      <div data-test-subj="content">
        <TabRowActionsProvider value={slot}>{children}</TabRowActionsProvider>
      </div>
    </>
  );
};

describe('TabRowActions', () => {
  it('portals its children into the tab row slot', () => {
    render(
      <Page>
        <TabRowActions fallback={<span>inline</span>}>
          <button>Create</button>
        </TabRowActions>
      </Page>
    );
    expect(within(screen.getByTestId('slot')).getByText('Create')).toBeInTheDocument();
    expect(within(screen.getByTestId('content')).queryByText('Create')).not.toBeInTheDocument();
    expect(screen.queryByText('inline')).not.toBeInTheDocument();
  });

  it('renders the fallback in place without a tab row', () => {
    render(
      <div data-test-subj="content">
        <TabRowActions fallback={<span>inline</span>}>
          <button>Create</button>
        </TabRowActions>
      </div>
    );
    expect(within(screen.getByTestId('content')).getByText('inline')).toBeInTheDocument();
    expect(screen.queryByText('Create')).not.toBeInTheDocument();
  });

  it('renders the children in place when no fallback is given', () => {
    render(
      <div data-test-subj="content">
        <TabRowActions>
          <button>Create</button>
        </TabRowActions>
      </div>
    );
    expect(within(screen.getByTestId('content')).getByText('Create')).toBeInTheDocument();
  });
});
