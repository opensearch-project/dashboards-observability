/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import './toolbar_button.scss';
import React from 'react';
import classNames from 'classnames';
import { EuiButton, PropsOf, EuiButtonProps } from '@elastic/eui';

const groupPositionToClassMap = {
  none: null,
  left: 'vizToolbarButton--groupLeft',
  center: 'vizToolbarButton--groupCenter',
  right: 'vizToolbarButton--groupRight',
};

export type ToolbarButtonProps = PropsOf<typeof EuiButton> & {
  /**
   * Determines prominence
   */
  fontWeight?: 'normal' | 'bold';
  /**
   * Smaller buttons also remove extra shadow for less prominence
   */
  size?: EuiButtonProps['size'];
  /**
   * Determines if the button will have a down arrow or not
   */
  hasArrow?: boolean;
  /**
   * Adjusts the borders for groupings
   */
  groupPosition?: 'none' | 'left' | 'center' | 'right';
  dataTestSubj?: string;
};

export const ToolbarButton: React.FunctionComponent<ToolbarButtonProps> = ({
  children,
  className,
  fontWeight = 'normal',
  size = 's',
  hasArrow = true,
  groupPosition = 'none',
  dataTestSubj = '',
  ...rest
}) => {
  const classes = classNames(
    'vizToolbarButton',
    groupPositionToClassMap[groupPosition],
    [`vizToolbarButton--${fontWeight}`, `vizToolbarButton--${size}`],
    className
  );
  return (
    <EuiButton
      data-test-subj={dataTestSubj}
      className={classes}
      iconSide="right"
      iconType={hasArrow ? 'arrowDown' : ''}
      color="text"
      contentProps={{
        className: 'vizToolbarButton__content',
      }}
      textProps={{
        className: 'vizToolbarButton__text',
      }}
      {...rest}
      size={size}
    >
      {children}
    </EuiButton>
  );
};
