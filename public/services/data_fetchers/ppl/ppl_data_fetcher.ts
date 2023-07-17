/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { isEmpty } from 'lodash';
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
import { PPL_STATS_REGEX } from '../../../../common/constants/shared';

export class PPLDataFetcher extends DataFetcherBase implements IDataFetcher {
  protected queryIndex: string;
  protected timestamp!: string;
  constructor(
    protected readonly query: IQuery,
    protected readonly storeContext,
    protected readonly searchContext,
    protected readonly searchParams,
    protected readonly notifications
  ) {
    super();
  }

  async setTimestamp(index: string) {
    try {
      const defaultTimestamp = await this.getTimestamp(index);
      this.timestamp = defaultTimestamp.default_timestamp || '';
      // schema conflicts for multiple indexes
      if (defaultTimestamp.hasSchemaConflict) {
        this.notifications.toasts.addError({
          title: 'Schema conflicts',
          text: `Schema conflicts detected while fetching default timestamp, ${defaultTimestamp.message}`,
        });
      }
    } catch (error) {
      this.notifications.toasts.addError(error, {
        title: 'Unable to get default timestamp',
      });
    }
  }

  async search() {
    const {
      query,
      appBaseQuery,
      startingTime,
      endingTime,
      isLiveTailOn,
      selectedInterval,
    } = this.searchParams;

    if (isEmpty(query)) return;

    this.queryIndex = this.getIndex(buildRawQuery(query, appBaseQuery));

    if (this.queryIndex === '') return; // Returns if page is refreshed

    const {
      tabId,
      findAutoInterval,
      getCountVisualizations,
      getLiveTail,
      getEvents,
      getErrorHandler,
      getPatterns,
      getAvailableFields,
    } = this.searchContext;
    const { dispatch, changeQuery } = this.storeContext;

    await this.processTimestamp(query);
    if (isEmpty(this.timestamp)) return;

    const curStartTime = startingTime || this.query[SELECTED_DATE_RANGE][0];
    const curEndTime = endingTime || this.query[SELECTED_DATE_RANGE][1];

    // compose final query
    const finalQuery = composeFinalQuery(
      this.query[RAW_QUERY],
      curStartTime,
      curEndTime,
      this.timestamp,
      isLiveTailOn,
      appBaseQuery,
      this.query[SELECTED_PATTERN_FIELD],
      this.query[PATTERN_REGEX],
      this.query[FILTERED_PATTERN]
    );

    // update UI with new query state
    await this.updateQueryState(this.query[RAW_QUERY], finalQuery, this.timestamp);
    // calculate proper time interval for count distribution
    if (!selectedInterval.current || selectedInterval.current.text === 'Auto') {
      findAutoInterval(curStartTime, curEndTime);
    }

    // get query data
    if (isLiveTailOn) {
      getLiveTail(finalQuery, getErrorHandler('Error fetching events'));
    } else {
      getEvents(finalQuery, getErrorHandler('Error fetching events'));
    }
    // still need all fields when query contains stats
    if (finalQuery.match(PPL_STATS_REGEX)) getAvailableFields(`search source=${this.queryIndex}`);
    getCountVisualizations(selectedInterval.current.value.replace(/^auto_/, ''));
    // patterns
    this.setLogPattern(this.query, this.queryIndex, finalQuery);
    if (!finalQuery.match(PATTERNS_REGEX)) {
      getPatterns(selectedInterval.current.value.replace(/^auto_/, ''));
    }

    // live tail - for comparing usage if for the same tab, user changed index from one to another
    if (!isLiveTailOn && !this.query.isLoaded) {
      dispatch(
        changeQuery({
          tabId,
          query: {
            isLoaded: true,
          },
        })
      );
    }
  }

  async setLogPattern(query: IQuery, index: string, finalQuery: string) {
    const { getErrorHandler, setDefaultPatternsField } = this.searchContext;
    // set pattern
    if (isEmpty(query[SELECTED_PATTERN_FIELD])) {
      await setDefaultPatternsField(
        index,
        '',
        getErrorHandler('Error fetching default pattern field')
      );
    }

    // check if above setDefaultPatternsField correctly gets valid patterns
    if (isEmpty(query[SELECTED_PATTERN_FIELD])) {
      this.notifications.toasts.addError({
        title: 'Invalid pattern field',
        text: 'Index does not contain a valid pattern field.',
      });
      return;
    }
  }

  async processTimestamp(query: IQuery) {
    if (query[SELECTED_TIMESTAMP]) {
      this.timestamp = query[SELECTED_TIMESTAMP];
    } else {
      await this.setTimestamp(this.queryIndex);
    }
  }

  getIndex(query: string) {
    return getIndexPatternFromRawQuery(query);
  }

  async getTimestamp(indexPattern: string): Promise<IDefaultTimestampState> {
    const { timestampUtils } = this.searchContext;
    return await timestampUtils.getTimestamp(indexPattern);
  }

  async updateQueryState(rawQuery: string, finalQuery: string, curTimestamp: string) {
    const { batch, dispatch, changeQuery, changeVizConfig } = this.storeContext;
    const { query } = this.searchParams;
    const {
      tabId,
      curVisId,
      selectedContentTabId,
      queryManager,
      getDefaultVisConfig,
    } = this.searchContext;

    await batch(() => {
      dispatch(
        changeQuery({
          tabId,
          query: {
            finalQuery,
            [RAW_QUERY]: query.rawQuery,
            [SELECTED_TIMESTAMP]: curTimestamp,
          },
        })
      );
      if (selectedContentTabId === TAB_CHART_ID) {
        // parse stats section on every search
        const statsTokens = queryManager.queryParser().parse(rawQuery).getStats();
        const updatedDataConfig = getDefaultVisConfig(statsTokens);
        dispatch(
          changeVizConfig({
            tabId,
            vizId: curVisId,
            data: { dataConfig: { ...updatedDataConfig } },
          })
        );
      }
    });
  }
}
