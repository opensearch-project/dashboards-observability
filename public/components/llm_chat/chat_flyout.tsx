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
  EuiFlyout,
  EuiFlyoutHeader,
  EuiPopover,
  EuiTab,
  EuiTabs,
} from '@elastic/eui';
import React, { useContext, useState } from 'react';
import { ChatContext } from './header_chat_button';
import { ChatPage } from './tabs/chat/chat_page';

type TabId = 'chat' | 'compose' | 'insights' | 'history';

interface ChatFlyoutProps {
  input: string;
  setInput: (input: string) => void;
}

export const ChatFlyout: React.FC<ChatFlyoutProps> = (props) => {
  const chatContext = useContext(ChatContext)!;
  const [selectedTabId, setSelectedTabId] = useState<TabId>('chat');

  const tabs = ([
    { id: 'chat', name: 'Chat' },
    { id: 'compose', name: 'Compose' },
    { id: 'insights', name: 'Insights' },
    { id: 'history', name: 'History' },
  ] as const).map((tab) => (
    <EuiTab
      onClick={() => setSelectedTabId(tab.id)}
      isSelected={tab.id === selectedTabId}
      key={tab.id}
    >
      {tab.name}
    </EuiTab>
  ));

  let content = null;
  switch (selectedTabId) {
    case 'chat':
      content = <ChatPage input={props.input} setInput={props.setInput} />;
      break;

    default:
      break;
  }

  return (
    <>
      <EuiFlyout
        className="llm-chat-flyout"
        paddingSize="none"
        size="460px"
        ownFocus={false}
        hideCloseButton
        onClose={() => chatContext.setFlyoutVisible(false)}
      >
        <EuiFlyoutHeader className="llm-chat-flyout-header">
          <EuiFlexGroup gutterSize="s" justifyContent="spaceBetween" alignItems="center">
            <EuiFlexItem>
              <EuiTabs className="llm-chat-tabs">{tabs}</EuiTabs>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <ChatTabControl
                openNewChat={() => {
                  chatContext.setChatId(undefined);
                  setSelectedTabId('chat');
                }}
              />
            </EuiFlexItem>
            <EuiFlexItem grow={false} />
          </EuiFlexGroup>
        </EuiFlyoutHeader>
        {content}
      </EuiFlyout>
    </>
  );
};

interface ChatTabControlProps {
  openNewChat: () => void;
}

const ChatTabControl: React.FC<ChatTabControlProps> = (props) => {
  const chatContext = useContext(ChatContext)!;
  const [isOpen, setIsOpen] = useState(false);
  const items = [
    <EuiContextMenuItem
      key="new_chat"
      onClick={() => {
        setIsOpen(false);
        props.openNewChat();
      }}
    >
      New chat
    </EuiContextMenuItem>,
  ];

  return (
    <EuiPopover
      button={
        <EuiButtonIcon size="m" iconType="boxesVertical" onClick={() => setIsOpen(!isOpen)} />
      }
      isOpen={isOpen}
      closePopover={() => setIsOpen(false)}
      panelPaddingSize="none"
    >
      <EuiContextMenuPanel items={items} />
    </EuiPopover>
  );
};
