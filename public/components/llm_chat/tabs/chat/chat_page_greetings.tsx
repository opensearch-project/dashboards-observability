/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import React from 'react';
import chatIcon from '../../../../assets/chat.svg';
import { GreetingCard } from '../../components/greeting_card';

interface ChatPageGreetingsProps {
  dismiss: () => void;
}

export const ChatPageGreetings: React.FC<ChatPageGreetingsProps> = (props) => {
  console.count('❗greetings rerender');
  const messages = [
    {
      title: 'example',
      details: "Show me the most important SLO's in my system",
    },
    {
      title: 'limitations',
      details: 'May occasionally generate incorrect information',
    },
    {
      title: 'capability',
      details: 'Allows user to provide follow-up corrections',
    },
  ];

  return (
    <>
      <EuiSpacer size="xxl" />
      <EuiFlexGroup alignItems="center" justifyContent="center">
        <EuiFlexItem grow={false}>
          <EuiIcon type={chatIcon} size="l" />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText className="llm-chat-greeting-header" color="subdued">
            OS ASSISTANT
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButtonIcon aria-label="close" color="text" onClick={props.dismiss} iconType="cross" />
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="m" />
      {messages.map((message) => (
        <>
          <GreetingCard title={message.title}>{message.details}</GreetingCard>
          <EuiSpacer />
        </>
      ))}
    </>
  );
};
