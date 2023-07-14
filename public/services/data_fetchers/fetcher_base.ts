/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { IDataFetcher } from './fetch_interface';

export abstract class DataFetcherBase implements IDataFetcher {
  constructor() {}
  abstract search(): void;
}
