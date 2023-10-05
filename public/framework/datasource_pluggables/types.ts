/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { IDataFetcher } from '../../services/data_fetchers/fetch_interface';

export interface IDataSourceComponentSet {
  ui: {
    QueryEditor: React.ReactNode;
    ConfigEditor: React.ReactNode;
    SidePanel: React.ReactNode;
  };
  services: {
    data_fetcher: IDataFetcher;
  };
}

export interface IDataSourcePluggableComponents {
  languages?: Record<string, IDataSourceComponentSet>;
  // Other variation keys can be added in the future
}
