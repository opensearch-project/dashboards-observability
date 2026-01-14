/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EuiFlexGroup, EuiLink, EuiFlexItem, EuiText, EuiToolTip } from '@elastic/eui';

interface ServiceCellProps {
  href?: string;
  service: string;
  environment: string;
  onClick?: () => void;
}

export const ServiceCell: React.FC<ServiceCellProps> = ({
  href,
  service,
  environment,
  onClick,
}) => {
  const ellipsisStyle = {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  } as const;

  const serviceTooltipContent = (
    <EuiFlexGroup direction="column" gutterSize="xs">
      <EuiFlexItem>
        <EuiText size="xs">
          <strong>Service:</strong> {service}
        </EuiText>
      </EuiFlexItem>
      <EuiFlexItem>
        <EuiText size="xs">
          <strong>Environment:</strong> {environment}
        </EuiText>
      </EuiFlexItem>
    </EuiFlexGroup>
  );

  const handleClick = (e: React.MouseEvent) => {
    if (onClick) {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <EuiToolTip content={serviceTooltipContent}>
      {!href && !onClick ? (
        <EuiText size="s">
          <span style={ellipsisStyle}>{service}</span>
        </EuiText>
      ) : onClick ? (
        <EuiLink onClick={handleClick} style={ellipsisStyle}>
          {service}
        </EuiLink>
      ) : (
        <EuiLink href={href} style={ellipsisStyle}>
          {service}
        </EuiLink>
      )}
    </EuiToolTip>
  );
};
