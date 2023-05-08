/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiButton, EuiFlexGroup, EuiFlexItem, EuiText } from '@elastic/eui';
import React from 'react';
import {
  IConversation,
  ISuggestedAction,
} from '../../../../../../common/types/observability_saved_object_attributes';
import { useChatActions } from '../../../hooks/use_chat_actions';

interface SuggestionBubbleProps {
  conversation: IConversation;
  suggestedAction: ISuggestedAction;
  inputDisabled: boolean;
}

export const SuggestionBubble: React.FC<SuggestionBubbleProps> = (props) => {
  const { executeAction } = useChatActions();
  return (
    <EuiFlexGroup justifyContent="flexStart">
      <EuiFlexItem grow={false}>
        <EuiButton
          className="llm-chat-suggestion-bubble-button"
          size="s"
          color="text"
          onClick={() => executeAction(props.suggestedAction, props.conversation)}
          isDisabled={props.inputDisabled}
        >
          <EuiText style={{ overflowWrap: 'break-word' }}>{props.suggestedAction.message}</EuiText>
        </EuiButton>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
