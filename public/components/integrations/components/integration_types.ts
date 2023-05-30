import { ChromeBreadcrumb, ChromeStart, HttpStart } from '../../../../../../src/core/public';

export interface AvailableIntegrationOverviewPageProps {
  http: HttpStart;
  chrome: ChromeStart;
  parentBreadcrumbs: ChromeBreadcrumb[];
}

export interface AddedIntegrationOverviewPageProps {
  http: HttpStart;
  chrome: ChromeStart;
  parentBreadcrumbs: ChromeBreadcrumb[];
}

export interface AvailableIntegrationProps {
  http: HttpStart;
  chrome: ChromeStart;
  parentBreadcrumbs: ChromeBreadcrumb[];
}

export interface AddedIntegrationProps {
  http: HttpStart;
  chrome: ChromeStart;
  parentBreadcrumbs: ChromeBreadcrumb[];
  integrationInstanceId: string;
}

export interface AvailableIntegrationProps {
  http: HttpStart;
  chrome: ChromeStart;
  parentBreadcrumbs: ChromeBreadcrumb[];
  integrationTemplateId: string;
}
