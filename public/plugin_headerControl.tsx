/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { coreRefs } from './framework/core_refs';

export const HeaderControlledComponentsWrapper = ({
  components,
}: {
  components: React.ReactElement[];
}) => {
  const HeaderControl = coreRefs.navigation?.ui.HeaderControl;
  const showActionsInHeader = coreRefs.chrome?.navGroup.getNavGroupEnabled();

  if (showActionsInHeader && HeaderControl) {
    return (
      <HeaderControl
        setMountPoint={coreRefs.application?.setAppRightControls}
        controls={components.map((component, index) => ({
          key: `header-control-${index}`,
          renderComponent: component,
        }))}
      />
    );
  }

  return <>{components}</>;
};
