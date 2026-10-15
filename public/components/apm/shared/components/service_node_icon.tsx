/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { getIcon } from '@osd/apm-topology';
import { coreRefs } from '../../../../framework/core_refs';
import { getNodeIconType, isDependencyType } from '../utils/platform_utils';
import { LanguageIcon } from './language_icon';
import './service_node_icon.scss';

interface ServiceNodeIconProps {
  /** The node's name; a dependency's name carries its system (e.g. `postgresql:orders`). */
  name: string;
  /** The node's type: service / database / messaging / external. */
  nodeType?: string;
  /** SDK language of a service (`telemetry.sdk.language`). */
  language?: string;
  /** Environment, used for the icon of an older OpenSearch-Dashboards build. */
  environment?: string;
  size?: 's' | 'm' | 'l';
}

const PIXEL_SIZE = { s: 16, m: 20, l: 24 };

/**
 * The icon for a node on APM pages: a dependency's system mark (PostgreSQL, Kafka, ...) or its
 * type's generic glyph, the same icon the application map shows; a service's SDK language icon.
 *
 * The map's icon styles switch with the map's own theme class, which is absent outside the map,
 * so this sets the theme class itself (see service_node_icon.scss).
 */
export const ServiceNodeIcon: React.FC<ServiceNodeIconProps> = ({
  name,
  nodeType,
  language,
  environment = '',
  size = 'm',
}) => {
  const [isDarkMode] = useState(() => {
    const theme = coreRefs.core?.uiSettings?.get('theme:darkMode');
    return theme === true || theme === 'true';
  });

  if (!isDependencyType(nodeType)) {
    return <LanguageIcon language={language} size={size} />;
  }

  const pixels = PIXEL_SIZE[size];
  return (
    <span
      className={`apmNodeIcon${isDarkMode ? ' apmNodeIcon--dark' : ''}`}
      style={{ width: pixels, height: pixels }}
      data-test-subj="apmDependencyIcon"
    >
      {getIcon(getNodeIconType(nodeType, environment, name))}
    </span>
  );
};
