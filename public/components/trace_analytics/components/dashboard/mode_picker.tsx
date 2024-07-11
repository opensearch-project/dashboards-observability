/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiSmallButtonEmpty, EuiPopover, EuiPopoverTitle, EuiSelectable } from '@elastic/eui';
import React, { useState } from 'react';
import { TraceAnalyticsMode } from '../../home';

const labels = new Map([
  ['jaeger', 'Jaeger'],
  ['data_prepper', 'Data Prepper'],
]);

export function DataSourcePicker(props: {
  modes: {
    id: string;
    title: string;
  }[];
  selectedMode: TraceAnalyticsMode;
  setMode: (mode: TraceAnalyticsMode) => void;
}) {
  const { modes, selectedMode, setMode } = props;
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
      <EuiSmallButtonEmpty
        flush="left"
        color="text"
        iconSide="right"
        iconType="arrowDown"
        title={title}
        onClick={() => setPopoverIsOpen(!isPopoverOpen)}
        {...rest}
      >
        {label}
      </EuiSmallButtonEmpty>
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
              "data-test-subj": x.id + '-mode',
            }))}
            onChange={(choices) => {
              const choice = choices.find(({ checked }) => checked) as unknown as {
                value: string;
                label: string;
                key: TraceAnalyticsMode;
              };
              setMode(choice.key);
              setPopoverIsOpen(false);
              sessionStorage.setItem('TraceAnalyticsMode', choice.key);
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
      </EuiPopover>
    </>
  );
}
