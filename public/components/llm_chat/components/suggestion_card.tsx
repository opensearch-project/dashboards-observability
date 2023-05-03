/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiFlexGroup, EuiFlexItem, EuiPanel, EuiText } from '@elastic/eui';
import React from 'react';

interface SuggestionCardProps {
  title: string;
}

export const SuggestionCard: React.FC<SuggestionCardProps> = (props) => {
  return (
    <EuiFlexGroup justifyContent="center" alignItems="center">
      <EuiFlexItem grow={false}>
        <EuiPanel className="llm-chat-suggestion-card-panel">
          <EuiFlexGroup alignItems="center">
            <EuiFlexItem grow={false}>
              <EuiText className="llm-chat-suggestion-card-panel-title">
                {props.title.toUpperCase()}
              </EuiText>
            </EuiFlexItem>
            <EuiFlexItem>
              {typeof props.children === 'string' ? (
                <EuiText>{props.children}</EuiText>
              ) : (
                props.children
              )}
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiPanel>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
