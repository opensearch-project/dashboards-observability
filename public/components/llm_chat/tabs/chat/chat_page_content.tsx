/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiEmptyPrompt, EuiSpacer } from '@elastic/eui';
import React, { useContext, useEffect, useRef } from 'react';
import { LoadingButton } from '../../components/loading_button';
import { ConversationContext } from '../../header_chat_button';
import { ChatPageGreetings } from './chat_page_greetings';
import { ConversationBubble } from './conversation_bubble';
import { ConversationContent } from './conversation_content';
import { SuggestionBubble } from './suggested_actions/suggestion_bubble';

interface ChatPageContentProps {
  showGreetings: boolean;
  setShowGreetings: (showGreetings: boolean) => void;
  conversationLoading: boolean;
  conversationLoadingError?: Error;
}

export const ChatPageContent: React.FC<ChatPageContentProps> = React.memo((props) => {
  console.count('chat page content rerender');
  const conversationContext = useContext(ConversationContext)!;
  const pageEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    pageEndRef.current?.scrollIntoView();
  }, [
    conversationContext.localConversation.conversations,
    conversationContext.localConversation.llmResponding,
  ]);

  if (props.conversationLoading && !conversationContext.localConversation.conversations.length) {
    return <LoadingButton />;
  } else if (props.conversationLoadingError) {
    return (
      <EuiEmptyPrompt
        iconType="alert"
        iconColor="danger"
        title={<h2>Error loading chat history</h2>}
        body={props.conversationLoadingError.message}
      />
    );
  }

  return (
    <>
      {props.showGreetings && <ChatPageGreetings dismiss={() => props.setShowGreetings(false)} />}
      {conversationContext.localConversation.conversations
        .map((conversation) => (
          <>
            <ConversationBubble type={conversation.type} contentType={conversation.contentType}>
              <ConversationContent conversation={conversation} />
            </ConversationBubble>
            {conversation.suggestedActions?.map((suggestedAction) => (
              <>
                <EuiSpacer size="s" />
                <SuggestionBubble conversation={conversation} suggestedAction={suggestedAction} />
              </>
            ))}
          </>
        ))
        .reduce((prev: React.ReactNode[], curr) => [...prev, <EuiSpacer />, curr], [])}
      {conversationContext.localConversation.llmResponding && <LoadingButton />}
      {conversationContext.localConversation.llmError && (
        <EuiEmptyPrompt
          iconType="alert"
          iconColor="danger"
          title={<h2>Error from response</h2>}
          body={conversationContext.localConversation.llmError.message}
        />
      )}
      <div ref={pageEndRef} />
    </>
  );
});
