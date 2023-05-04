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
import React, { useContext, useState } from 'react';
import { ChatContext } from '../header_chat_button';

export type TabId = 'chat' | 'compose' | 'insights' | 'history';

interface ChatTabBarProps {
  selectedTabId: TabId;
  setSelectedTabId: (selectedTabId: TabId) => void;
}

const tabs = [
  { id: 'chat', name: 'Chat' },
  { id: 'compose', name: 'Compose' },
  { id: 'insights', name: 'Insights' },
  { id: 'history', name: 'History' },
] as const;

export const ChatTabBar: React.FC<ChatTabBarProps> = React.memo((props) => {
  console.count('❗tab bar rerender ' + props.selectedTabId);
  const chatContext = useContext(ChatContext)!;
  const [isOpen, setIsOpen] = useState(false);
  const tabsComponent = tabs.map((tab) => (
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
        chatContext.setChatId(undefined);
        props.setSelectedTabId('chat');
      }}
    >
      New chat
    </EuiContextMenuItem>,
  ];

  return (
    <EuiFlexGroup gutterSize="s" justifyContent="spaceBetween" alignItems="center">
      <EuiFlexItem>
        <EuiTabs className="llm-chat-tabs">{tabsComponent}</EuiTabs>
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
