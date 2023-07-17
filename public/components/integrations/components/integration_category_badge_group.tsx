/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiBadge, EuiBadgeGroup, EuiToolTip } from '@elastic/eui';
import React from 'react';

export const badges = (categories) => {
  if (categories.length <= 3) {
    return (
      <EuiBadgeGroup>
        {categories.map((cateogry) => {
          return <EuiBadge>{cateogry.name}</EuiBadge>;
        })}
      </EuiBadgeGroup>
    );
  } else {
    const tooltip = `+${categories.length - 2} more`;
    return (
      <EuiBadgeGroup>
        <EuiBadge>{categories[0].name}</EuiBadge>
        <EuiBadge>{categories[1].name}</EuiBadge>
        <EuiBadge>
          <EuiToolTip
            content={categories.slice(2).map((item, index) => (index ? ', ' : '') + item.name)}
          >
            <h4>{tooltip}</h4>
          </EuiToolTip>
        </EuiBadge>
      </EuiBadgeGroup>
    );
  }
};
