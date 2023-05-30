import { ChromeBreadcrumb, ChromeStart, HttpStart } from '../../../../../../src/core/public';

export interface AvailableIntegrationOverviewPageProps {
  parentBreadcrumb: ChromeBreadcrumb;
  http: HttpStart;
  chrome: ChromeStart;
  parentBreadcrumbs: ChromeBreadcrumb[];
}

export interface AddedIntegrationOverviewPageProps {
  parentBreadcrumb: ChromeBreadcrumb;
  http: HttpStart;
  chrome: ChromeStart;
  parentBreadcrumbs: ChromeBreadcrumb[];
}
