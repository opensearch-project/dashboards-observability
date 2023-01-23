/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Observable } from 'rxjs';
import { DashboardStart } from '../../../src/plugins/dashboard/public';
import { NavigationPublicPluginStart } from '../../../src/plugins/navigation/public';

export interface AppPluginStartDependencies {
  navigation: NavigationPublicPluginStart;
  dashboard: DashboardStart;
}

export interface DashboardListSource {
  name: string;
  listProviderFn: () => Observable<DashboardListItem>;
}

export type DashboardListSources = DashboardListSource[];

export type DashboardCreators = DashboardCreator[];

export type DashboardCreatorFn = (history: any) => (event: MouseEvent) => void;

export interface DashboardCreator {
  id: string; // key identifier for creator plugin/module
  defaultText: string; // display name for create link
  creatorFn: DashboardCreatorFn; // onClick call this
}

export interface DashboardListItem {
  id: string; // plugin identifier
  title: string; // item title
  type: string; // item type display string
  description: string; // item description
  url: string; // redirect url to item detail
  editUrl: string; // redirect url to item edit
  deleteUrl?: string; // redirect url to item delete
  listType: string; // item type key,
  updated_at: number | string; // last-modified time of item
}

export type DashboardListItems = DashboardListItem[];
export type DashboardListProviderFn = () => Observable<DashboardListItem>;
export interface DashboardDisplay {
  hits: DashboardListItems;
  total: number;
}
