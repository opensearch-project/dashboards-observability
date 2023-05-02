/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiButtonIcon, EuiFlexGroup, EuiFlexItem, EuiTextArea } from '@elastic/eui';
import React from 'react';

interface ChatInputControlsProps {
  input: string;
  setInput: (input: string) => void;
  onSumbit: () => void;
}

export const ChatInputControls: React.FC<ChatInputControlsProps> = (props) => {
  return (
    <>
      <EuiFlexGroup gutterSize="m" alignItems="flexEnd" justifyContent="spaceEvenly">
        <EuiFlexItem grow={false} />
        <EuiFlexItem grow={false}>
          <EuiButtonIcon size="m" iconSize="l" iconType="pin" />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiTextArea
            fullWidth
            compressed
            placeholder="Ask me anything.."
            style={{ height: '41px' }}
            value={props.input}
            onChange={(e) => props.setInput(e.target.value)}
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButtonIcon size="m" display="fill" iconType="sortRight" onClick={props.onSumbit} />
        </EuiFlexItem>
        <EuiFlexItem grow={false} />
      </EuiFlexGroup>
    </>
  );
};
