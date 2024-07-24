/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChromeBreadcrumb, ChromeStart, HttpStart } from '../../../../../../src/core/public';

export interface AvailableIntegrationOverviewPageProps {
  http: HttpStart;
  chrome: ChromeStart;
}

export interface AddedIntegrationOverviewPageProps {
  http: HttpStart;
  chrome: ChromeStart;
}

export interface AvailableIntegrationProps {
  http: HttpStart;
  chrome: ChromeStart;
}

export interface AddedIntegrationProps {
  http: HttpStart;
  chrome: ChromeStart;
  integrationInstanceId: string;
}

export interface AvailableIntegrationProps {
  http: HttpStart;
  chrome: ChromeStart;
  integrationTemplateId: string;
}
