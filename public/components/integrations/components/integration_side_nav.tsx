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

export const Sidebar = (props: { children: React.ReactNode }) => {
  const sidebarItems = [
    {
      name: 'Integrations',
      id: 0,
      items: [
        {
          name: 'Available integrations',
          id: 1,
          href: '#/available',
        },
        {
          name: 'Added integrations',
          id: 2,
          href: '#/added',
        },
      ],
    },
  ];

  function setIsSelected(
    items: Array<EuiSideNavItemType<React.ReactNode>>,
    hash: string,
    initial = true,
    reverse = false
  ): boolean {
    // Default page is Events Analytics
    // But it is kept as second option in side nav
    if (hash === '#/') {
      items[0].items[0].isSelected = true;
      return true;
    }
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.href && ((reverse && item.href.startsWith(hash)) || hash.startsWith(item.href))) {
        item.isSelected = true;
        return true;
      }
      if (item.items?.length && setIsSelected(item.items, hash, false, reverse)) return true;
    }
    return initial && setIsSelected(items, hash, false, !reverse);
  }

  setIsSelected(sidebarItems, location.hash);

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
            <EuiSideNav items={sidebarItems} />
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPageSideBar>
      <EuiPageBody>{props.children}</EuiPageBody>
    </EuiPage>
  );
};
