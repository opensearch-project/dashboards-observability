/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiSpacer } from '@elastic/eui';
import React, { useEffect, useRef } from 'react';
import { IConversation } from '../../types';
import { InputBubble } from './input_bubble';
import { OutputBubble } from './output_bubble';

interface ChatPageContentProps {
  localConversations: IConversation[];
}

export const ChatPageContent: React.FC<ChatPageContentProps> = (props) => {
  const pageEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    pageEndRef.current?.scrollIntoView();
  }, []);

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
        .reduce((accu: React.ReactNode[], elem) => [...accu, <EuiSpacer />, elem], [])}
      <div ref={pageEndRef} />
    </>
  );
};
