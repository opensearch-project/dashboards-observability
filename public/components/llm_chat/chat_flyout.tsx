/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiFlyout, EuiFlyoutHeader } from '@elastic/eui';
import React, { useContext, useEffect, useState } from 'react';
import { ChatTabBar, TabId } from './components/chat_tab_bar';
import { ChatContext } from './header_chat_button';
import { ChatPage } from './tabs/chat/chat_page';
import { ChatHistoryPage } from './tabs/history/chat_history_page';

interface ChatFlyoutProps {
  input: string;
  setInput: (input: string) => void;
}

export const ChatFlyout: React.FC<ChatFlyoutProps> = (props) => {
  console.count('❗flyout rerender');
  const chatContext = useContext(ChatContext)!;
  const [selectedTabId, setSelectedTabId] = useState<TabId>('chat');

  let content = null;
  switch (selectedTabId) {
    case 'chat':
      content = <ChatPage input={props.input} setInput={props.setInput} />;
      break;

    case 'history':
      content = <ChatHistoryPage />;
      break;

    default:
      break;
  }

  useEffect(() => {
    setSelectedTabId('chat');
  }, [chatContext.chatId]);

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
          <ChatTabBar selectedTabId={selectedTabId} setSelectedTabId={setSelectedTabId} />
        </EuiFlyoutHeader>
        {content}
      </EuiFlyout>
    </>
  );
};
