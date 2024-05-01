/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiButtonIcon,
  EuiCodeBlock,
  EuiCopy,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiHorizontalRule,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import _ from 'lodash';
import moment from 'moment';
import React, { useEffect, useState } from 'react';
import { HttpSetup } from '../../../../../../../src/core/public';
import { TRACE_ANALYTICS_DATE_FORMAT } from '../../../../../common/constants/trace_analytics';
import { SpanField } from '../../../../../common/types/trace_analytics';
import { TraceAnalyticsMode } from '../../home';
import { handleSpansFlyoutRequest } from '../../requests/traces_request_handler';
import { microToMilliSec, nanoToMilliSec } from '../common/helper_functions';
import { FlyoutListItem } from './flyout_list_item';

const MODE_TO_FIELDS: Record<TraceAnalyticsMode, Record<SpanField, string | undefined>> = {
  data_prepper: {
    SPAN_ID: 'spanId',
    PARENT_SPAN_ID: 'parentSpanId',
    SERVICE: 'serviceName',
    OPERATION: 'name',
    DURATION: 'durationInNanos',
    START_TIME: 'startTime',
    END_TIME: 'endTime',
    ERRORS: 'status.code',
  },
  jaeger: {
    SPAN_ID: 'spanID',
    PARENT_SPAN_ID: undefined,
    SERVICE: 'process.serviceName',
    OPERATION: 'operationName',
    DURATION: 'duration',
    START_TIME: 'startTime',
    END_TIME: undefined,
    ERRORS: 'tag.error',
  },
};

const getSpanFieldKey = (mode: TraceAnalyticsMode, field: SpanField) => MODE_TO_FIELDS[mode][field];

const getSpanValue = (span: object, mode: TraceAnalyticsMode, field: SpanField) => {
  const fieldKey = getSpanFieldKey(mode, field);
  if (fieldKey === undefined) return undefined;
  return _.get(span, fieldKey);
};

export function SpanDetailFlyout(props: {
  http: HttpSetup;
  spanId: string;
  isFlyoutVisible: boolean;
  closeFlyout: () => void;
  addSpanFilter: (field: string, value: any) => void;
  mode: TraceAnalyticsMode;
}) {
  const { mode } = props;
  const [span, setSpan] = useState<any>({});

  useEffect(() => {
    handleSpansFlyoutRequest(props.http, props.spanId, setSpan, mode);
  }, [props.spanId]);

  const getListItem = (
    fieldKey: string | undefined,
    title: React.ReactNode,
    description: React.ReactNode
  ) => {
    return (
      <FlyoutListItem
        title={title}
        description={description}
        key={`list-item-${title}`}
        addSpanFilter={
          fieldKey ? () => props.addSpanFilter(fieldKey, _.get(span, fieldKey)) : undefined
        }
      />
    );
  };

  const isEmpty = (value) => {
    return (
      value == null ||
      (value.hasOwnProperty('length') && value.length === 0) ||
      (value.constructor === Object && Object.keys(value).length === 0)
    );
  };

  const renderContent = () => {
    if (!span || _.isEmpty(span)) return '-';
    const overviewList = [
      getListItem(
        getSpanFieldKey(mode, 'SPAN_ID'),
        'Span ID',
        getSpanValue(span, mode, 'SPAN_ID') ? (
          <EuiFlexGroup gutterSize="xs" style={{ marginTop: -4, marginBottom: -4 }}>
            <EuiFlexItem grow={false}>
              <EuiCopy textToCopy={getSpanValue(span, mode, 'SPAN_ID')}>
                {(copy) => (
                  <EuiButtonIcon aria-label="copy-button" onClick={copy} iconType="copyClipboard" />
                )}
              </EuiCopy>
            </EuiFlexItem>
            <EuiFlexItem>{getSpanValue(span, mode, 'SPAN_ID')}</EuiFlexItem>
          </EuiFlexGroup>
        ) : (
          '-'
        )
      ),
      getListItem(
        getSpanFieldKey(mode, 'PARENT_SPAN_ID'),
        'Parent span ID',
        getSpanValue(span, mode, 'PARENT_SPAN_ID') ? (
          <EuiFlexGroup gutterSize="xs" style={{ marginTop: -4, marginBottom: -4 }}>
            <EuiFlexItem grow={false}>
              <EuiCopy
                textToCopy={mode === 'data_prepper' ? span.parentSpanId : span.references[0].spanID}
              >
                {(copy) => (
                  <EuiButtonIcon aria-label="copy-button" onClick={copy} iconType="copyClipboard" />
                )}
              </EuiCopy>
            </EuiFlexItem>
            <EuiFlexItem data-test-subj="parentSpanId">
              {mode === 'data_prepper' ? span.parentSpanId : span.references[0].spanID}
            </EuiFlexItem>
          </EuiFlexGroup>
        ) : (
          '-'
        )
      ),
      getListItem(
        getSpanFieldKey(mode, 'SERVICE'),
        'Service',
        getSpanValue(span, mode, 'SERVICE') || '-'
      ),
      getListItem(
        getSpanFieldKey(mode, 'OPERATION'),
        'Operation',
        getSpanValue(span, mode, 'OPERATION') || '-'
      ),
      getListItem(
        getSpanFieldKey(mode, 'DURATION'),
        'Duration',
        `${
          mode === 'data_prepper'
            ? _.round(nanoToMilliSec(Math.max(0, span.durationInNanos)), 2)
            : _.round(microToMilliSec(Math.max(0, span.duration)), 2)
        } ms`
      ),
      getListItem(
        getSpanFieldKey(mode, 'START_TIME'),
        'Start time',
        mode === 'data_prepper'
          ? moment(span.startTime).format(TRACE_ANALYTICS_DATE_FORMAT)
          : moment(_.round(microToMilliSec(Math.max(0, span.startTime)), 2)).format(
              TRACE_ANALYTICS_DATE_FORMAT
            )
      ),
      getListItem(
        getSpanFieldKey(mode, 'END_TIME'),
        'End time',
        mode === 'data_prepper'
          ? moment(span.endTime).format(TRACE_ANALYTICS_DATE_FORMAT)
          : moment(_.round(microToMilliSec(Math.max(0, span.startTime + span.duration)), 2)).format(
              TRACE_ANALYTICS_DATE_FORMAT
            )
      ),
      getListItem(
        getSpanFieldKey(mode, 'ERRORS'),
        'Errors',
        (mode === 'data_prepper' ? span['status.code'] === 2 : span.tag?.error) ? (
          <EuiText color="danger" size="s" style={{ fontWeight: 700 }}>
            Yes
          </EuiText>
        ) : (
          'No'
        )
      ),
    ];
    const ignoredKeys = new Set([
      'spanId',
      'spanID',
      'parentSpanId',
      'serviceName',
      'name',
      'operationName',
      'durationInNanos',
      'duration',
      'startTime',
      'startTimeMillis',
      'endTime',
      'status.code',
      'events',
      'traceId',
      'traceID',
      'traceGroup',
      'traceGroupFields.endTime',
      'traceGroupFields.statusCode',
      'traceGroupFields.durationInNanos',
    ]);
    const attributesList = Object.keys(span)
      .filter((key) => !ignoredKeys.has(key))
      .sort((keyA, keyB) => {
        const isANull = isEmpty(span[keyA]);
        const isBNull = isEmpty(span[keyB]);
        if ((isANull && isBNull) || (!isANull && !isBNull)) return keyA < keyB ? -1 : 1;
        if (isANull) return 1;
        return -1;
      })
      .map((key) => {
        if (isEmpty(span[key])) return getListItem(key, key, '-');
        let value = span[key];
        if (typeof value === 'object') value = JSON.stringify(value);
        return getListItem(key, key, value);
      });

    const eventsComponent = _.isEmpty(span.events) ? null : (
      <>
        <EuiText size="m">
          <span className="panel-title">Event</span>
        </EuiText>
        <EuiCodeBlock language="json" paddingSize="s" isCopyable overflowHeight={400}>
          {JSON.stringify(span.events, null, 2)}
        </EuiCodeBlock>
        <EuiSpacer size="xs" />
        <EuiHorizontalRule margin="s" />
      </>
    );

    return (
      <>
        <EuiText size="m">
          <span className="panel-title">Overview</span>
        </EuiText>
        <EuiSpacer size="s" />
        {overviewList}
        <EuiSpacer size="xs" />
        <EuiHorizontalRule margin="s" />
        {eventsComponent}
        <EuiText size="m">
          <span className="panel-title">Span attributes</span>
          {attributesList.length === 0 || attributesList.length ? (
            <span className="panel-title-count">{` (${attributesList.length})`}</span>
          ) : null}
        </EuiText>
        <EuiSpacer size="s" />
        {attributesList}
      </>
    );
  };

  return (
    <>
      <EuiFlyout data-test-subj="spanDetailFlyout" onClose={props.closeFlyout} size="s">
        <EuiFlyoutHeader hasBorder>
          <EuiTitle>
            <h2>Span detail</h2>
          </EuiTitle>
        </EuiFlyoutHeader>
        <EuiFlyoutBody>{renderContent()}</EuiFlyoutBody>
      </EuiFlyout>
    </>
  );
}
