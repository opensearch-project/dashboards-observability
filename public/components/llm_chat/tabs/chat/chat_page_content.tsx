/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiSpacer } from '@elastic/eui';
import React, { useEffect, useRef } from 'react';
import { LoadingButton } from '../../components/loading_button';
import { IConversation } from '../../types';
import { ChatPageSuggestions } from './chat_page_suggestions';
import { InputBubble } from './input_bubble';
import { OutputBubble } from './output_bubble';

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
  }, [props.localConversations]);

  if (props.loading && !props.localConversations.length) {
    return <LoadingButton />;
  } else if (props.error) {
    return <div>error: {props.error.message}</div>;
  }

  return (
    <>
      {props.showSuggestions && (
        <ChatPageSuggestions closeSuggestions={() => props.setShowSuggestions(false)} />
      )}
      {props.localConversations
        .map((conversation) => {
          switch (conversation.type) {
            case 'input':
              return <InputBubble input={conversation.content} />;
            case 'output':
              return <OutputBubble output={conversation.content} />;
          }
        })
        .reduce((prev: React.ReactNode[], curr) => [...prev, <EuiSpacer />, curr], [])}
      {props.llmResponding && <LoadingButton />}
      {props.llmError && <div>LLM error: {props.llmError.message}</div>}
      <div ref={pageEndRef} />
    </>
  );
});
