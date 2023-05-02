/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiSpacer } from '@elastic/eui';
import React from 'react';
import { useGetConversation } from '../../hooks/use_get_conversation';
import { InputBubble } from './input_bubble';
import { OutputBubble } from './output_bubble';

interface ChatPageContentProps {}

export const ChatPageContent: React.FC<ChatPageContentProps> = (props) => {
  console.log('❗page content rerender:');
  const { conversation, loading, error } = useGetConversation()
  return (
    <>
      {[...Array(1).keys()]
        .flatMap((i) => [<OutputBubble />, <InputBubble />])
        .reduce((accu, elem) => {
          return accu === null ? [elem] : [...accu, <EuiSpacer />, elem];
        }, null)}
    </>
  );
};
