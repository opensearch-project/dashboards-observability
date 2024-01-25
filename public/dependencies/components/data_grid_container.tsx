/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { EuiDataGridColumn } from '@elastic/eui';
import {
  DataGrid,
  DataGridProps,
} from '../../components/event_analytics/explorer/events_views/data_grid';
import { getOSDHttp, getPPLService } from '../../../common/utils';
import { selectFields } from '../../components/event_analytics/redux/slices/field_slice';
import { initialTabId } from '../../framework/redux/store/shared_state';
import { useFetchEvents } from '../../components/event_analytics/hooks';
import { redoQuery } from '../../components/event_analytics/utils/utils';
import { DEFAULT_TIMESTAMP_COLUMN } from '../../../common/constants/explorer';
import { RenderProps } from '../../types';

export const DataGridContainer = (
  props: Pick<DataGridProps, 'rawQuery'> & { renderProps: RenderProps }
) => {
  const { renderProps, ...others } = props;
  const pplService = getPPLService();
  const http = getOSDHttp();
  const tabId = initialTabId;
  const explorerFields = useSelector(selectFields)[tabId];
  const { fetchEvents } = useFetchEvents({
    pplService,
    requestParams: {
      tabId,
    },
  });
  const [data, setData] = useState<any[]>([]);
  const isFullScreen = renderProps.chatContext.flyoutFullScreen;
  useEffect(() => {
    if (props.rawQuery) {
      redoQuery(
        '',
        '',
        props.rawQuery || '',
        '',
        { current: [] },
        { current: [0, 5] },
        fetchEvents,
        setData
      );
    }
  }, [props.rawQuery]);
  const formatGridColumn = useCallback(
    (columns: EuiDataGridColumn[]) =>
      columns.map((item) => {
        if (item.id === DEFAULT_TIMESTAMP_COLUMN.id) {
          const { initialWidth, ...otherConfig } = item;
          return {
            ...otherConfig,
            initialWidth: renderProps.chatContext.flyoutFullScreen ? initialWidth : 50,
          };
        }

        return item;
      }),
    [renderProps.chatContext.flyoutFullScreen]
  );
  if (!data.length || !props.rawQuery) {
    return null;
  }
  return (
    <div style={{ overflowX: 'hidden' }}>
      <DataGrid
        http={http}
        pplService={pplService}
        rows={data}
        explorerFields={explorerFields}
        timeStampField="timestamp"
        totalHits={data.length}
        requestParams={{
          tabId,
        }}
        startTime={''}
        endTime="now"
        storedSelectedColumns={[]}
        formatGridColumn={formatGridColumn}
        OuiDataGridProps={{
          gridStyle: isFullScreen
            ? {}
            : {
                fontSize: 's',
                cellPadding: 's',
              },
          /**
           * Chatbot's default width is smaller than 478
           */
          minSizeForControls: 300,
          /**
           * In non-fullscreen mode, it requires at least 80px to avoid truncate.
           */
          rowHeightsOptions: {
            defaultHeight: isFullScreen ? undefined : 80,
          },
        }}
        {...others}
      />
    </div>
  );
};
