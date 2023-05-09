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
import { ChatContext } from '../chat_header_button';
import { useChatActions } from '../hooks/use_chat_actions';

export type TabId = 'chat' | 'compose' | 'insights' | 'history';

const tabs = [
  { id: 'chat', name: 'Chat' },
  { id: 'compose', name: 'Compose' },
  { id: 'insights', name: 'Insights' },
  { id: 'history', name: 'History' },
] as const;

export const ChatTabBar: React.FC = React.memo(() => {
  console.count('tab bar rerender');
  const chatContext = useContext(ChatContext)!;
  const { openChat } = useChatActions();
  const [isOpen, setIsOpen] = useState(false);
  const tabsComponent = tabs.map((tab) => (
    <EuiTab
      onClick={() => chatContext.setSelectedTabId(tab.id)}
      isSelected={tab.id === chatContext.selectedTabId}
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
        openChat(undefined);
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
