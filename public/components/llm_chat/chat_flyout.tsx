/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiFlyout, EuiFlyoutHeader } from '@elastic/eui';
import React, { useContext } from 'react';
import { ChatContext } from './chat_header_button';
import { ChatTabBar } from './components/chat_tab_bar';
import { ChatPage } from './tabs/chat/chat_page';
import { ChatHistoryPage } from './tabs/history/chat_history_page';

interface ChatFlyoutProps {
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
}

export const ChatFlyout: React.FC<ChatFlyoutProps> = (props) => {
  const chatContext = useContext(ChatContext)!;

  let content = null;
  switch (chatContext.selectedTabId) {
    case 'chat':
      content = <ChatPage input={props.input} setInput={props.setInput} />;
      break;

    case 'history':
      content = <ChatHistoryPage />;
      break;

    default:
      break;
  }

  return (
    <EuiFlyout
      className="llm-chat-flyout"
      paddingSize="none"
      size="460px"
      ownFocus={false}
      hideCloseButton
      onClose={() => chatContext.setFlyoutVisible(false)}
    >
      <EuiFlyoutHeader className="llm-chat-flyout-header">
        <ChatTabBar />
      </EuiFlyoutHeader>
      {content}
    </EuiFlyout>
  );
};
