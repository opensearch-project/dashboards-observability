/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiButtonIcon, EuiFlexGroup, EuiFlexItem, EuiTextArea } from '@elastic/eui';
import autosize from 'autosize';
import React, { useEffect, useRef } from 'react';

interface ChatInputControlsProps {
  input: string;
  setInput: (input: string) => void;
  onSumbit: () => void;
}

export const ChatInputControls: React.FC<ChatInputControlsProps> = (props) => {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (inputRef.current) autosize(inputRef.current);
  }, []);

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
            rows={1}
            compressed
            placeholder="Ask me anything..."
            value={props.input}
            onChange={(e) => props.setInput(e.target.value)}
            inputRef={inputRef}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                props.onSumbit();
              }
            }}
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
