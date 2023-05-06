/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiFlexGroup, EuiFlexItem, EuiPanel, EuiText } from '@elastic/eui';
import React from 'react';
import {
  IConversation,
  ISuggestedAction,
} from '../../../../../../common/types/observability_saved_object_attributes';
import { executeAction } from './execute_action';

interface SuggestionBubbleProps {
  conversation: IConversation;
  suggestedAction: ISuggestedAction;
}

export const SuggestionBubble: React.FC<SuggestionBubbleProps> = (props) => {
  return (
    <EuiFlexGroup justifyContent="flexStart">
      <EuiFlexItem grow={false}>
        <EuiPanel
          className="llm-chat-suggestion-bubble-panel"
          onClick={() => executeAction(props.suggestedAction.actionType, props.conversation)}
          grow={false}
          paddingSize="s"
          color="plain"
          hasBorder
        >
          <EuiText size="s">{props.suggestedAction.message}</EuiText>
        </EuiPanel>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
