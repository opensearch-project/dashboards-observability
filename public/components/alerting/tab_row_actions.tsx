/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext } from 'react';
import { createPortal } from 'react-dom';

/**
 * The right side of the Alert Manager tab row. Each tab renders its own
 * page-level controls (the Alerts time picker, the Rules Refresh / Create
 * buttons, the Routing source selector) through `TabRowActions`, which portals
 * them into this slot. The controls stay in the component that owns their
 * state, and the tab row shows only the active tab's controls, because only
 * the active tab is mounted.
 *
 * Without a provider (a tab rendered on its own, as in unit tests), the
 * fallback is rendered in place instead.
 */
const TabRowActionsContext = createContext<HTMLElement | null>(null);

export const TabRowActionsProvider = TabRowActionsContext.Provider;

export const TabRowActions: React.FC<{
  children: React.ReactNode;
  /** Rendered in place when there is no tab row to portal into. */
  fallback?: React.ReactNode;
}> = ({ children, fallback }) => {
  const target = useContext(TabRowActionsContext);
  if (target) return createPortal(children, target);
  return <>{fallback === undefined ? children : fallback}</>;
};
