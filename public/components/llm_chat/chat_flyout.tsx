/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiFlyout, EuiFlyoutHeader } from '@elastic/eui';
import React, { useContext, useEffect, useState } from 'react';
import { SimpleSavedObject } from '../../../../../src/core/public';
import { CHAT_SAVED_OBJECT } from '../../../common/types/observability_saved_object_attributes';
import { ChatTabBar, TabId } from './components/chat_tab_bar';
import { ChatContext } from './header_chat_button';
import { ChatPage } from './tabs/chat/chat_page';
import { IChat } from './types';

interface ChatFlyoutProps {
  input: string;
  setInput: (input: string) => void;
}

export const ChatFlyout: React.FC<ChatFlyoutProps> = (props) => {
  console.count('❗flyout rerender');
  const chatContext = useContext(ChatContext)!;
  const [selectedTabId, setSelectedTabId] = useState<TabId>('chat');

  const [chats, setChats] = useState<Array<SimpleSavedObject<IChat>>>([]);
  useEffect(() => {
    chatContext.savedObjectsClient
      .find<IChat>({ type: CHAT_SAVED_OBJECT })
      .then((response) => setChats(response.savedObjects));
  }, []);

  let content = null;
  switch (selectedTabId) {
    case 'chat':
      content = <ChatPage input={props.input} setInput={props.setInput} />;
      break;

    case 'history':
      content = chats.map((chat) => (
        <button
          onClick={() => {
            console.log(chat.id);
            chatContext.setChatId(chat.id);
            setSelectedTabId('chat');
          }}
        >
          {chat.attributes.title}
        </button>
      ));

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
          <ChatTabBar selectedTabId={selectedTabId} setSelectedTabId={setSelectedTabId} />
        </EuiFlyoutHeader>
        {content}
      </EuiFlyout>
    </>
  );
};
