/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiFlyout, EuiFlyoutHeader, EuiTab, EuiTabs } from '@elastic/eui';
import React, { useContext, useMemo, useState } from 'react';
import { ChatContext } from './header_chat_button';
import { ChatPage } from './tabs/chat/chat_page';

type TabId = 'chat' | 'compose' | 'insights' | 'history';

interface ChatFlyoutProps {
  input: string;
  setInput: (input: string) => void;
}

export const ChatFlyout: React.FC<ChatFlyoutProps> = (props) => {
  const chatContext = useContext(ChatContext)!;
  const [selectedId, setSelectedId] = useState<TabId>('chat');

  const tabs = useMemo(
    () =>
      (
        [
          { id: 'chat', name: 'Chat' },
          { id: 'compose', name: 'Compose' },
          { id: 'insights', name: 'Insights' },
          { id: 'history', name: 'History' },
        ] as const
      ).map((tab) => (
        <EuiTab
          onClick={() => setSelectedId(tab.id)}
          isSelected={tab.id === selectedId}
          key={tab.id}
        >
          {tab.name}
        </EuiTab>
      )),
    [selectedId]
  );

  let content = null;
  switch (selectedId) {
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
        <EuiFlyoutHeader>
          <EuiTabs className="llm-chat-tabs">{tabs}</EuiTabs>
        </EuiFlyoutHeader>
        {content}
      </EuiFlyout>
    </>
  );
};
