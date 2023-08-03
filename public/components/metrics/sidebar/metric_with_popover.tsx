/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';

import {
  EuiPopover,
  EuiButton,
  EuiText,
  EuiForm,
  EuiFormRow,
  EuiSelect,
  EuiComboBox,
} from '@elastic/eui';
import { MetricName } from './metric_name';

export const MetricWithPopover = ({ metric }) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const onButtonClick = () => setIsPopoverOpen((currOpen) => !currOpen);
  const closePopover = () => setIsPopoverOpen(false);

  const attributeOptions = [
    {
      label: 'host',
    },

    {
      label: 'path',
    },
    {
      label: 'method',
    },
  ];

  return (
    <EuiPopover
      button={<MetricName metric={metric} handleClick={onButtonClick} />}
      isOpen={isPopoverOpen}
      closePopover={closePopover}
      anchorPosition="rightUp"
    />
  );
};
