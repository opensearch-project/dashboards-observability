/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiButton,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPage,
  EuiPageBody,
  EuiPageSideBar,
  EuiSideNav,
  EuiSideNavItemType,
  EuiSwitch,
} from '@elastic/eui';
import React from 'react';
//   import { useState } from 'react';
//   import { toMountPoint } from '../../../../../src/plugins/opensearch_dashboards_react/public';
//   import { uiSettingsService } from '../../../common/utils';

export const Sidebar = (props: { children: React.ReactNode }) => {
  const items = [
    {
      name: 'Integrations',
      id: 0,
      items: [
        {
          name: 'Available integrations',
          id: 1,
          href: '#/placeholder/available',
        },
        {
          name: 'Added integrations',
          id: 2,
          href: '#/placeholder/added',
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
};
