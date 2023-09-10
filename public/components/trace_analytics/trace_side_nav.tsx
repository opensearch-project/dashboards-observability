/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiPage,
  EuiPageBody,
  EuiPageSideBar,
  EuiSideNav,
  EuiSideNavItemType,
} from '@elastic/eui';
import React from 'react';

export function TraceSideBar(props: { children: React.ReactNode }) {
  function setIsSelected(items: Array<EuiSideNavItemType<React.ReactNode>>, hash: string): boolean {
    if (hash === '#/traces') {
      items[0].items[1].isSelected = true;
      return true;
    }
    if (hash === '#/services' || hash === '#/') {
      items[0].items[0].isSelected = true;
      return true;
    }
  }

  const items = [
    {
      name: 'Trace analytics',
      id: 1,
      href: '#/',
      items: [
        {
          name: 'Services',
          id: 1.1,
          href: '#/services',
        },
        {
          name: 'Traces',
          id: 1.2,
          href: '#/traces',
        },
      ],
    },
  ];

  setIsSelected(items, location.hash);

  return (
    <EuiPage>
      <EuiPageSideBar>
        <EuiFlexGroup
          direction="column"
          justifyContent="spaceBetween"
          style={{ height: '100%' }}
          gutterSize="none"
        >
          <EuiFlexItem>
            <EuiSideNav items={items} />
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPageSideBar>
      <EuiPageBody>{props.children}</EuiPageBody>
    </EuiPage>
  );
}
