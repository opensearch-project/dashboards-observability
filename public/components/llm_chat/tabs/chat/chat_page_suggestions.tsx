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
import { SuggestionCard } from '../../components/suggestion_card';

interface ChatPageSuggestionsProps {
  closeSuggestions: () => void;
}

export const ChatPageSuggestions: React.FC<ChatPageSuggestionsProps> = (props) => {
  const suggestions = [
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
          <EuiText className="llm-chat-suggestion-header" color="subdued">
            OS ASSISTANT
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButtonIcon color="text" onClick={props.closeSuggestions} iconType="cross" />
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="m" />
      {suggestions.map((suggestion) => (
        <>
          <SuggestionCard title={suggestion.title}>{suggestion.details}</SuggestionCard>
          <EuiSpacer />
        </>
      ))}
    </>
  );
};
