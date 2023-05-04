/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiButtonIcon,
  EuiContextMenuItem,
  EuiContextMenuPanel,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPopover,
  EuiTab,
  EuiTabs,
} from '@elastic/eui';
import React, { useState } from 'react';

export type TabId = 'chat' | 'compose' | 'insights' | 'history';

interface ChatTabBarProps {
  selectedTabId: TabId;
  setSelectedTabId: (selectedTabId: TabId) => void;
  // chatContext causes rerender without context change, passing in setChatId directly to avoid it
  setChatId: (chatId?: string) => void;
}

export const ChatTabBar: React.FC<ChatTabBarProps> = React.memo((props) => {
  console.count('❗tab bar rerender ' + props.selectedTabId);
  const [isOpen, setIsOpen] = useState(false);
  const tabs = ([
    { id: 'chat', name: 'Chat' },
    { id: 'compose', name: 'Compose' },
    { id: 'insights', name: 'Insights' },
    { id: 'history', name: 'History' },
  ] as const).map((tab) => (
    <EuiTab
      onClick={() => props.setSelectedTabId(tab.id)}
      isSelected={tab.id === props.selectedTabId}
      key={tab.id}
    >
      {tab.name}
    </EuiTab>
  ));

  const items = [
    <EuiContextMenuItem
      key="new_chat"
      onClick={() => {
        setIsOpen(false);
        props.setChatId(undefined);
        props.setSelectedTabId('chat');
      }}
    >
      New chat
    </EuiContextMenuItem>,
  ];

  return (
    <EuiFlexGroup gutterSize="s" justifyContent="spaceBetween" alignItems="center">
      <EuiFlexItem>
        <EuiTabs className="llm-chat-tabs">{tabs}</EuiTabs>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiPopover
          button={
            <EuiButtonIcon
              aria-label="menu"
              size="m"
              iconType="boxesVertical"
              onClick={() => setIsOpen(!isOpen)}
            />
          }
          isOpen={isOpen}
          closePopover={() => setIsOpen(false)}
          panelPaddingSize="none"
        >
          <EuiContextMenuPanel items={items} />
        </EuiPopover>
      </EuiFlexItem>
      <EuiFlexItem grow={false} />
    </EuiFlexGroup>
  );
});
