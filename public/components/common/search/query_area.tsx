/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiButton,
  EuiCodeEditor,
  EuiContextMenuPanel,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiPanel,
  EuiPopover,
} from '@elastic/eui';
import React from 'react';

export function QueryArea({
  languagePopOverButton,
  isLanguagePopoverOpen,
  closeLanguagePopover,
  languagePopOverItems,
}: any) {
  return (
    <EuiPanel paddingSize="m">
      <EuiFlexGroup gutterSize="m" direction="column">
        <EuiFlexItem>
          <EuiFlexGroup gutterSize="s" alignItems="flexStart">
            <EuiFlexItem key="lang-selector" className="search-area lang-selector" grow={false}>
              <EuiPopover
                id="smallContextMenuExample"
                button={languagePopOverButton}
                isOpen={isLanguagePopoverOpen}
                closePopover={closeLanguagePopover}
                panelPaddingSize="none"
                anchorPosition="downLeft"
              >
                <EuiContextMenuPanel size="s" items={languagePopOverItems} />
              </EuiPopover>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButton>index name here</EuiButton>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiCodeEditor
            theme="textmate"
            width="100%"
            height="10rem"
            showPrintMargin={false}
            setOptions={{
              fontSize: '14px',
            }}
            aria-label="Code Editor"
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiFlexGroup alignItems="center" gutterSize="m">
            <EuiFlexItem grow={false}>
              <EuiIcon type="packetbeatApp" size="m" />
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiFieldText fullWidth={true} placeholder="Ask a question" />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButton iconSide="right" iconType="returnKey" fill={true}>
                Go
              </EuiButton>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  );
}
