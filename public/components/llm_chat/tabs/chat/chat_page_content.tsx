/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiEmptyPrompt, EuiSpacer } from '@elastic/eui';
import React, { useEffect, useRef } from 'react';
import { LoadingButton } from '../../components/loading_button';
import { IConversation } from '../../types';
import { ChatPageGreetings } from './chat_page_greetings';
import { ConversationBubble } from './conversation_bubble';
import { ConversationContent } from './conversation_content';

interface ChatPageContentProps {
  showSuggestions: boolean;
  setShowSuggestions: (showSuggestions: boolean) => void;
  localConversations: IConversation[];
  loading: boolean;
  error?: Error;
  llmResponding: boolean;
  llmError?: Error;
}

export const ChatPageContent: React.FC<ChatPageContentProps> = React.memo((props) => {
  console.count('❗chat page content rerender');
  const pageEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    pageEndRef.current?.scrollIntoView();
  }, [props.localConversations, props.llmResponding]);

  if (props.loading && !props.localConversations.length) {
    return <LoadingButton />;
  } else if (props.error) {
    return (
      <EuiEmptyPrompt
        iconType="alert"
        iconColor="danger"
        title={<h2>Error loading chat history</h2>}
        body={props.error.message}
      />
    );
  }

  return (
    <>
      {props.showSuggestions && (
        <ChatPageGreetings closeSuggestions={() => props.setShowSuggestions(false)} />
      )}
      {props.localConversations
        .map((conversation) => (
          <ConversationBubble type={conversation.type} contentType={conversation.contentType}>
            <ConversationContent conversation={conversation} />
          </ConversationBubble>
        ))
        .reduce((prev: React.ReactNode[], curr) => [...prev, <EuiSpacer />, curr], [])}
      {props.llmResponding && <LoadingButton />}
      {props.llmError && (
        <EuiEmptyPrompt
          iconType="alert"
          iconColor="danger"
          title={<h2>Error from response</h2>}
          body={props.llmError.message}
        />
      )}
      <div ref={pageEndRef} />
    </>
  );
});
