/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiButton,
  EuiButtonEmpty,
  EuiFieldText,
  EuiPopover,
  EuiPopoverTitle,
  EuiSelectable,
  EuiSpacer,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import React, { useState } from 'react';
import { TraceAnalyticsMode } from '../../home';

const labels = new Map([
  ['jaeger', 'Jaeger'],
  ['data_prepper', 'Data Prepper'],
  ['custom', 'Custom Index Pattern'],
]);

export function DataSourcePicker(props: {
  modes: Array<{
    id: string;
    title: string;
  }>;
  selectedMode: TraceAnalyticsMode;
  setMode: (mode: TraceAnalyticsMode) => void;
  customIndexPattern: string;
  setCustomIndexPattern: (customIndexPattern: string) => void;
}) {
  const { modes, selectedMode, setMode, customIndexPattern, setCustomIndexPattern } = props;
  const [isPopoverOpen, setPopoverIsOpen] = useState(false);

  const trigger = {
    label: labels.get(selectedMode),
    title: selectedMode,
    'data-test-subj': 'indexPattern-switch-link',
    className: 'dscIndexPattern__triggerButton',
  };

  const createTrigger = () => {
    const { label, title, ...rest } = trigger;
    return (
      <EuiButtonEmpty
        flush="left"
        color="text"
        iconSide="right"
        iconType="arrowDown"
        title={title}
        onClick={() => setPopoverIsOpen(!isPopoverOpen)}
        {...rest}
      >
        {label +
          (selectedMode === 'custom' && customIndexPattern.length !== 0
            ? `: ${customIndexPattern}`
            : '')}
      </EuiButtonEmpty>
    );
  };

  const [value, setValue] = useState(customIndexPattern);

  const onChange = (e) => {
    setValue(e.target.value);
  };

  const renderIndexPatternPicker = () => {
    return (
      <>
        <EuiSpacer size="m" />
        <EuiFieldText
          placeholder={customIndexPattern}
          value={value}
          onChange={(e) => onChange(e)}
          aria-label="Use aria labels when no actual label is in use"
          append={
            <EuiButton
              data-test-subj="enterCustomIndexPattern"
              value={value}
              onClick={() => {
                setCustomIndexPattern(value);
                sessionStorage.setItem('CustomIndexPattern', value);
                setPopoverIsOpen(false);
              }}
              disabled={value.length === 0}
            >
              Enter
            </EuiButton>
          }
        />
      </>
    );
  };

  return (
    <>
      <EuiPopover
        button={createTrigger()}
        isOpen={isPopoverOpen}
        closePopover={() => setPopoverIsOpen(false)}
        className="eui-textTruncate"
        anchorClassName="eui-textTruncate"
        display="inlineBlock"
        panelPaddingSize="s"
        ownFocus
      >
        <div className="popOverContainer">
          <EuiPopoverTitle>{'Choose data type'}</EuiPopoverTitle>
          <EuiSelectable
            data-test-subj="indexPattern-switcher"
            searchable
            singleSelection="always"
            options={modes.map((x) => ({
              label: x.title,
              key: x.id,
              value: x.id,
              checked: x.id === selectedMode ? 'on' : undefined,
              'data-test-subj': x.id + '-mode',
            }))}
            onChange={(choices) => {
              const choice = (choices.find(({ checked }) => checked) as unknown) as {
                value: string;
                label: string;
                key: TraceAnalyticsMode;
              };
              setMode(choice.key);
              sessionStorage.setItem('TraceAnalyticsMode', choice.key);
              if (choice.key !== 'custom') {
                setPopoverIsOpen(false);
              }
            }}
            searchProps={{
              compressed: true,
            }}
          >
            {(list, search) => (
              <>
                {search}
                {list}
              </>
            )}
          </EuiSelectable>
        </div>
        {selectedMode === 'custom' ? renderIndexPatternPicker() : null}
      </EuiPopover>
    </>
  );
}
