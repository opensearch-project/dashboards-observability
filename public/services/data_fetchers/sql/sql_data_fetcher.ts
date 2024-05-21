/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { IDefaultTimestampState, IQuery } from '../../../../common/types/explorer';
import { IDataFetcher } from '../fetch_interface';
import { DataFetcherBase } from '../fetcher_base';
import {
  buildRawQuery,
  composeFinalQuery,
  getIndexPatternFromRawQuery,
} from '../../../../common/utils';
import {
  FILTERED_PATTERN,
  PATTERNS_REGEX,
  PATTERN_REGEX,
  RAW_QUERY,
  SELECTED_DATE_RANGE,
  SELECTED_PATTERN_FIELD,
  SELECTED_TIMESTAMP,
  TAB_CHART_ID,
} from '../../../../common/constants/explorer';
import { PPL_BASE, PPL_SEARCH, PPL_STATS_REGEX } from '../../../../common/constants/shared';
import { CoreStart } from '../../../../../../src/core/public';
import { useFetchEvents } from '../../../components/event_analytics/hooks';
import { SQLService } from '../../../services/requests/sql';

export class SQLDataFetcher extends DataFetcherBase implements IDataFetcher {
  constructor(private readonly http: CoreStart['http']) {
    super();
  }

  async search(query: string, callback) {
    callback(query);

    const sqlService = new SQLService(this.http);
    return sqlService.fetch({
      query,
      lang: 'sql',
      datasource: '',
    });
  }
}
