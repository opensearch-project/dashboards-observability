/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiButton, EuiButtonGroup } from '@elastic/eui';

const QUERY_MODE_OPTIONS = [
  { label: 'Builder', id: 'visual_builder' },
  { label: 'Code', id: 'query_editor' },
];

export const QueryModeSwitcher = () => {
  const [toggleCompressedIdSelected, setToggleCompressedIdSelected] = useState('query_editor');

  const onModeChange = (modeId: string) => {
    setToggleCompressedIdSelected(modeId);
  };

  return (
    <EuiButtonGroup
      color="text"
      id="hidden"
      isDisabled={false}
      isIconOnly={false}
      key="1"
      name="Hidden"
      onChange={onModeChange}
      buttonSize="compressed"
      options={QUERY_MODE_OPTIONS}
      idSelected={toggleCompressedIdSelected}
      legend=""
      isFullWidth={false}
    />
  );
};

export const QueryHeader = (props) => {
  return (
    <>
      <EuiFlexGroup gutterSize="s" justifyContent="flexStart" alignItems="flexStart">
        <EuiFlexItem grow={3} />
        <EuiFlexItem key="queryHeader__search-run" className="queryHeader__search-run" grow={false}>
          <EuiButton fill size="s" iconType="play">
            Run
          </EuiButton>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <QueryModeSwitcher />
        </EuiFlexItem>
      </EuiFlexGroup>
    </>
  );
};
