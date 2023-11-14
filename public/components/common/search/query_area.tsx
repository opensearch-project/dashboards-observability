/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiAccordion,
  EuiCallOut,
  EuiCodeEditor,
  EuiContextMenuPanel,
  EuiFlexGroup,
  EuiFlexItem,
  EuiMarkdownFormat,
  EuiPanel,
  EuiPopover,
  EuiSpacer,
  EuiSuperSelect,
  EuiText,
  EuiIcon,
  EuiButton,
} from '@elastic/eui';
import React, { useState } from 'react';
import { LLMInput } from '../../event_analytics/explorer/llm/input';
import { uiSettingsService } from '../../../../common/utils';
import { QUERY_LANGUAGE } from '../../../../common/constants/data_sources';

export function QueryArea({
  languagePopOverButton,
  isLanguagePopoverOpen,
  closeLanguagePopover,
  languagePopOverItems,
  tabId,
  handleQueryChange,
  handleTimeRangePickerRefresh,
  tempQuery,
  showFlyout,
  handleQueryLanguageChange,
  runChanges,
}: any) {
  // TODO: REMOVE ALL BELOW
  const options = [
    { value: 'PPL', inputDisplay: <EuiText>PPL</EuiText> },
    { value: 'DQL', inputDisplay: <EuiText>DQL</EuiText> },
  ];

  const [queryLang, setQueryLang] = useState(QUERY_LANGUAGE.PPL);

  const onChange = (lang: string) => {
    handleQueryLanguageChange(lang);
    setQueryLang(lang);
  };

  return (
    <EuiPanel paddingSize="m">
      <EuiFlexGroup gutterSize="m" direction="column">
        <LLMInput
          tabId={tabId}
          handleQueryChange={handleQueryChange}
          handleTimeRangePickerRefresh={handleTimeRangePickerRefresh}
        >
          <EuiFlexItem key="lang-selector" className="search-area lang-selector" grow={false}>
            <EuiSuperSelect options={options} valueOfSelected={queryLang} onChange={onChange} />
            {/* <EuiPopover
              id="smallContextMenuExample"
              button={languagePopOverButton}
              isOpen={isLanguagePopoverOpen}
              closePopover={closeLanguagePopover}
              panelPaddingSize="none"
              anchorPosition="downLeft"
            >
              <EuiContextMenuPanel size="s" items={languagePopOverItems} />
            </EuiPopover> */}
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiIcon
              className={`${
                uiSettingsService.get('theme:darkMode') ? 'ppl-link-dark' : 'ppl-link-light'
              }`}
              type="questionInCircle"
              size="l"
              onClick={() => showFlyout()}
              color="#159D8D"
              // onClickAriaLabel={'pplLinkShowFlyout'}
            />
          </EuiFlexItem>
        </LLMInput>
        <EuiFlexItem>
          <EuiCodeEditor
            theme="textmate"
            width="100%"
            height="4rem"
            showPrintMargin={false}
            setOptions={{
              fontSize: '14px',
            }}
            aria-label="Code Editor"
            onChange={(query) => {
              handleQueryChange(query);
            }}
            value={tempQuery}
            wrapEnabled={true}
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButton
            onClick={runChanges}
            iconType="refresh"
            iconSide="left"
            fill
            style={{ width: 100 }}
          >
            Update
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  );
}
