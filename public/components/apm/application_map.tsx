/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ChromeBreadcrumb, NotificationsStart } from '../../../../../src/core/public';
import { ApplicationMapPage } from './pages/application_map';

export interface ApmApplicationMapProps {
  chrome: any;
  parentBreadcrumb: ChromeBreadcrumb;
  notifications: NotificationsStart;
  [key: string]: any;
}

export const ApplicationMap = (props: ApmApplicationMapProps) => {
  return <ApplicationMapPage {...props} />;
};
