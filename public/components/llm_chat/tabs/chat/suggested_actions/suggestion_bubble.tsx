/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiButton, EuiFlexGroup, EuiFlexItem, EuiPanel, EuiText } from '@elastic/eui';
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
        {/* EuiButton does not have good support for long text */}
        <EuiPanel
          className="llm-chat-suggestion-bubble-panel"
          onClick={() => executeAction(props.suggestedAction, props.conversation)}
          grow={false}
          paddingSize="s"
          color="plain"
          disabled={props.inputDisabled}
          hasBorder
        >
          <EuiText>{props.suggestedAction.message}</EuiText>
        </EuiPanel>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
