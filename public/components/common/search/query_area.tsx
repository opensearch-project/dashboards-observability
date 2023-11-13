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
}: any) {
  const [summarizedText, setSummarizedText] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [isPPLError, setIsPPLError] = useState(false);

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
          setSummarizedText={setSummarizedText}
          setSummaryLoading={setSummaryLoading}
          setIsPPLError={setIsPPLError}
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
        {/* <EuiFlexItem>
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
              <EuiComboBox
                placeholder="Select an index"
                isClearable={false}
                prepend={['Index']}
                singleSelection={{ asPlainText: true }}
                isLoading={loading}
                options={data}
                selectedOptions={selectedIndex}
                onChange={(index) => setSelectedIndex(index)}
              />
            </EuiFlexItem>
          </EuiFlexGroup>
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
        </EuiFlexItem> */}
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
              console.log(query);
              handleQueryChange(query);
            }}
            value={tempQuery}
            wrapEnabled={true}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="s" />
      <EuiAccordion
        id="summarization-accordion"
        buttonContent="Summary"
        initialIsOpen
        isLoading={summaryLoading}
        isLoadingMessage="Loading summary.."
      >
        {summarizedText.length > 0 && (
          <>
            {isPPLError ? (
              <EuiCallOut title="There was an error" color="danger" iconType="alert">
                <EuiMarkdownFormat>{summarizedText}</EuiMarkdownFormat>
              </EuiCallOut>
            ) : (
              <EuiPanel color="subdued" style={{ marginLeft: 16, marginRight: 16 }}>
                <EuiMarkdownFormat>{summarizedText}</EuiMarkdownFormat>
              </EuiPanel>
            )}
          </>
        )}
      </EuiAccordion>
    </EuiPanel>
  );
}
