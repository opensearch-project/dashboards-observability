/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiSmallButtonIcon,
  EuiCompressedFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiCompressedFormRow,
  EuiLink,
  EuiPopover,
  EuiPopoverFooter,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { PatternTableData } from 'common/types/explorer';
import { PPL_PATTERNS_DOCUMENTATION_URL } from '../../../../../common/constants/shared';

interface PatternsHeaderProps {
  patternsData: { patternTableData: PatternTableData[] };
  patternRegexInput: string;
  setPatternRegexInput: (pattern: string) => void;
  onPatternApply: () => void;
  setIsPatternConfigPopoverOpen: (flag: boolean) => void;
  isPatternConfigPopoverOpen: boolean;
}

export const PatternsHeader = ({
  patternsData,
  patternRegexInput,
  setPatternRegexInput,
  onPatternApply,
  setIsPatternConfigPopoverOpen,
  isPatternConfigPopoverOpen,
}: PatternsHeaderProps) => {
  return (
    <EuiFlexGroup gutterSize="s" alignItems="center">
      <EuiFlexItem grow={false}>
        <EuiTitle size="s">
          <h3 style={{ margin: '0px' }}>
            Patterns{' '}
            <span className="pattern-header-count">
              ({patternsData.patternTableData?.length || 0})
            </span>
          </h3>
        </EuiTitle>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiPopover
          button={
            <EuiSmallButtonIcon
              iconType="gear"
              onClick={() => setIsPatternConfigPopoverOpen(!isPatternConfigPopoverOpen)}
            />
          }
          isOpen={isPatternConfigPopoverOpen}
          closePopover={() => setIsPatternConfigPopoverOpen(false)}
          anchorPosition="upCenter"
        >
          <EuiTitle size="xxs">
            <h3>Pattern regex</h3>
          </EuiTitle>
          <EuiText size="s">Log patterns allow you to cluster your logs, to help</EuiText>
          <EuiText size="s">summarize large volume of logs.</EuiText>
          <EuiSpacer size="s" />
          <EuiCompressedFormRow
            helpText={
              <EuiText size="s">
                Pattern regex is used to reduce logs into log groups.{' '}
                <EuiLink href={PPL_PATTERNS_DOCUMENTATION_URL} target="_blank">
                  help
                </EuiLink>
              </EuiText>
            }
          >
            <EuiCompressedFieldText
              value={patternRegexInput}
              onChange={(e) => setPatternRegexInput(e.target.value)}
            />
          </EuiCompressedFormRow>
          <EuiPopoverFooter>
            <EuiFlexGroup justifyContent="flexEnd">
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty size="s" onClick={() => setIsPatternConfigPopoverOpen(false)}>
                  Cancel
                </EuiButtonEmpty>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButton
                  size="s"
                  fill
                  onClick={() => {
                    setIsPatternConfigPopoverOpen(false);
                    onPatternApply();
                  }}
                >
                  Apply
                </EuiButton>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiPopoverFooter>
        </EuiPopover>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
