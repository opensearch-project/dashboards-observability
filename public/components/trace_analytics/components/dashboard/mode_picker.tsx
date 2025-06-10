/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiPopover, EuiPopoverTitle, EuiSelectable, EuiSmallButtonEmpty } from '@elastic/eui';
import React, { useState } from 'react';
import { TraceAnalyticsMode } from '../../../../../common/types/trace_analytics';

const labels = new Map([
  ['jaeger', 'Jaeger'],
  ['data_prepper', 'Data Prepper'],
]);

export function DataSourcePicker(props: {
  modes: Array<{
    id: string;
    title: string;
  }>;
  selectedMode: TraceAnalyticsMode;
  setMode: (mode: TraceAnalyticsMode) => void;
}) {
  const { modes = [], selectedMode, setMode } = props;
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

  const updateUrlWithMode = (key: TraceAnalyticsMode) => {
    const currentUrl = window.location.href.split('#')[0];
    const hash = window.location.hash;

    if (hash) {
      const [hashPath, hashQueryString] = hash.substring(1).split('?');
      const queryParams = new URLSearchParams(hashQueryString || '');
      queryParams.set('mode', key);

      const newHash = `${hashPath}?${queryParams.toString()}`;
      const newUrl = `${currentUrl}#${newHash}`;
      window.history.replaceState(null, '', newUrl);
    } else {
      // Non-hash-based URL
      const queryParams = new URLSearchParams(window.location.search);
      queryParams.set('mode', key);

      const newUrl = `${currentUrl}?${queryParams.toString()}`;
      window.history.replaceState(null, '', newUrl);
    }
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
          <EuiPopoverTitle>{'Choose data schema'}</EuiPopoverTitle>
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
              updateUrlWithMode(choice.key);
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
