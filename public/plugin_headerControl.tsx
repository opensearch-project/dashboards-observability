/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EuiText } from '@elastic/eui';
import { coreRefs } from './framework/core_refs';

interface HeaderControlledComponentsWrapperProps {
  components?: React.ReactElement[];
  badgeContent?: React.ReactElement | string | number;
  description?: string;
}

export const HeaderControlledComponentsWrapper = ({
  components = [],
  badgeContent,
  description,
}: HeaderControlledComponentsWrapperProps) => {
  const HeaderControl = coreRefs.navigation?.ui.HeaderControl;
  const showActionsInHeader = coreRefs.chrome?.navGroup.getNavGroupEnabled();

  const formattedBadgeContent = badgeContent ? `(${badgeContent})` : '';

  if (showActionsInHeader && HeaderControl) {
    return (
      <>
        {badgeContent && (
          <HeaderControl
            setMountPoint={coreRefs.application?.setAppBadgeControls}
            controls={[
              {
                key: 'header-badge-control-left',
                renderComponent: <span key="badge">{formattedBadgeContent}</span>,
              },
            ]}
          />
        )}
        {description && (
          <HeaderControl
            setMountPoint={coreRefs.application?.setAppDescriptionControls}
            controls={[
              {
                key: 'header-description-control',
                renderComponent: <EuiText key="description">{description}</EuiText>,
              },
            ]}
          />
        )}
        {components.length > 0 && (
          <HeaderControl
            setMountPoint={coreRefs.application?.setAppRightControls}
            controls={components.map((component, index) => ({
              key: `header-control-${index}`,
              renderComponent: component,
            }))}
          />
        )}
      </>
    );
  }

  // Only render the components if the nav group is disabled
  return (
    <>
      {components.map((component, index) =>
        React.cloneElement(component, { key: `component-fallback-${index}` })
      )}
    </>
  );
};
