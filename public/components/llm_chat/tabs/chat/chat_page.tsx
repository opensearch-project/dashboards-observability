/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiFlyoutBody, EuiFlyoutFooter, EuiPage, EuiPageBody, EuiSpacer } from '@elastic/eui';
import React, { useContext, useState } from 'react';
import {
  CHAT_SAVED_OBJECT,
  SAVED_OBJECT_VERSION,
} from '../../../../../common/types/observability_saved_object_attributes';
import { ChatContext } from '../../header_chat_button';
import { useFetchChat } from '../../hooks/use_fetch_chat';
import { IChat, IConversation } from '../../types';
import { ChatInputControls } from './chat_input_controls';
import { ChatPageContent } from './chat_page_content';

interface ChatPageProps {
  input: string;
  setInput: (input: string) => void;
}

export const ChatPage: React.FC<ChatPageProps> = (props) => {
  const chatContext = useContext(ChatContext)!;
  const [localConversations, setLocalConversations] = useState<IConversation[]>([]);
  const { chat, loading, error } = useFetchChat();
  console.log('❗chat:', chat);

  const onSubmit = async () => {
    if (!props.input) return;
    const newConversation: IConversation = {
      type: 'input',
      content: props.input,
    };
    if (!chatContext.chatId) {
      const createResponse = await chatContext.savedObjectsClient.create<IChat>(CHAT_SAVED_OBJECT, {
        title: props.input.substring(0, 50),
        version: SAVED_OBJECT_VERSION,
        createdTimeMs: new Date().getTime(),
        conversations: [...localConversations, newConversation],
      });
      chatContext.setChatId(createResponse.id);
    } else {
      chatContext.savedObjectsClient.update<Partial<IChat>>(CHAT_SAVED_OBJECT, chatContext.chatId, {
        conversations: [...localConversations, newConversation],
      });
    }
    props.setInput('');
    setLocalConversations([...localConversations, newConversation]);
  };

  return (
    <>
      <EuiFlyoutBody>
        <EuiPage>
          <EuiPageBody component="div" className="llm-chat-page-body">
            <ChatPageContent localConversations={localConversations} />
          </EuiPageBody>
        </EuiPage>
      </EuiFlyoutBody>
      <EuiFlyoutFooter>
        <EuiSpacer />
        <ChatInputControls input={props.input} setInput={props.setInput} onSumbit={onSubmit} />
        <EuiSpacer />
      </EuiFlyoutFooter>
    </>
  );
};
