/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiSpacer } from '@elastic/eui';
import React, { useEffect, useRef, useState } from 'react';
import { LoadingButton } from '../../components/loading_button';
import { SuggestionCard } from '../../components/suggestion_card';
import { IConversation } from '../../types';
import { InputBubble } from './input_bubble';
import { OutputBubble } from './output_bubble';

interface ChatPageContentProps {
  localConversations: IConversation[];
  llmResponding: boolean;
  llmError?: Error;
}

export const ChatPageContent: React.FC<ChatPageContentProps> = (props) => {
  const pageEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    pageEndRef.current?.scrollIntoView();
  }, [props.localConversations]);

  return (
    <>
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
};
