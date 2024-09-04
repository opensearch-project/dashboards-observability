/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiPopover,
  EuiPopoverFooter,
  EuiPopoverTitle,
  EuiSelectable,
  EuiSmallButton,
  EuiSmallButtonEmpty,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import React, { useState } from 'react';
import { TraceAnalyticsMode } from '../../../../../common/types/trace_analytics';
import { CustomIndexFlyout } from '../common/custom_index_flyout';

const labels = new Map([
  ['jaeger', 'Jaeger'],
  ['data_prepper', 'Data Prepper'],
  ['custom_data_prepper', 'Custom source'],
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
  const [isFlyoutVisible, setIsFlyoutVisible] = useState(false);

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
          <EuiPopoverFooter>
            <EuiFlexGroup gutterSize="s">
              <EuiFlexItem grow={false}>
                <EuiSmallButton
                  onClick={() => {
                    setIsFlyoutVisible(true);
                    setPopoverIsOpen(false);
                  }}
                >
                  Manage custom source
                </EuiSmallButton>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiText>
                  <EuiToolTip content="Custom trace and service indices is an experimental feature">
                    <EuiIcon type="iInCircle" />
                  </EuiToolTip>
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiPopoverFooter>
        </div>
      </EuiPopover>
      <CustomIndexFlyout
        isFlyoutVisible={isFlyoutVisible}
        setIsFlyoutVisible={setIsFlyoutVisible}
      />
    </>
  );
}
