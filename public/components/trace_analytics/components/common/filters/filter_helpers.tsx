/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiCompressedComboBox,
  EuiCompressedFieldText,
  EuiCompressedFormRow,
  EuiFlexItem,
  EuiFormControlLayoutDelimited,
  EuiSpacer,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import get from 'lodash/get';
import React from 'react';
import { TraceAnalyticsMode } from '../../../../../../common/types/trace_analytics';

const getFields = (
  mode: TraceAnalyticsMode,
  page: 'dashboard' | 'traces' | 'services' | 'app',
  attributesFilterFields: string[]
) =>
  mode === 'data_prepper'
    ? {
        dashboard: ['traceGroup', 'serviceName', 'error', 'status.message', 'latency'],
        traces: [
          'traceId',
          'traceGroup',
          'serviceName',
          'error',
          'status.message',
          'latency',
          ...attributesFilterFields,
        ],
        services: [
          'traceGroup',
          'serviceName',
          'error',
          'status.message',
          'latency',
          ...attributesFilterFields,
        ],
        app: ['traceId', 'traceGroup', 'serviceName'],
      }[page]
    : {
        dashboard: ['process.serviceName', 'error', 'latency'],
        traces: ['traceID', 'operationName', 'process.serviceName', 'error', 'latency'],
        services: ['process.serviceName', 'error', 'latency'],
        app: ['traceID', 'process.serviceName'],
      }[page];
// filters will take effect and can be manually added
export const getFilterFields = (
  mode: TraceAnalyticsMode,
  page: 'dashboard' | 'traces' | 'services' | 'app',
  attributesFilterFields: string[]
) => getFields(mode, page, attributesFilterFields);
// filters will take effect
export const getValidFilterFields = (
  mode: TraceAnalyticsMode,
  page: 'dashboard' | 'traces' | 'services' | 'app',
  attributesFilterFields: string[]
) => {
  const fields = getFields(mode, page, attributesFilterFields);
  if (page !== 'services') return [...fields, 'Latency percentile within trace group'];
  return fields;
};

const getType = (field: string): string | null => {
  const typeMapping = {
    attributes: {
      host: {
        port: 'long',
      },
      http: {
        response_content_length: 'long',
        status_code: 'long',
      },
      net: {
        port: 'long',
      },
    },
    attributes_host: {
      port: 'long',
    },
    attributes_http: {
      response_content_length: 'long',
      status_code: 'long',
    },
    attributes_net: {
      port: 'long',
    },
    durationInNanos: 'long',
    latency: 'long',
    endTime: 'date_nanos',
    startTime: 'date_nanos',
  };
  const type = get(typeMapping, field, 'keyword');
  return typeof type === 'string' ? type : null;
};

export const getInvertedOperator = (operator: string, inverted: boolean) => {
  if (operator.includes('between')) return inverted ? 'is not between' : 'is between';
  else if (operator.includes('exist')) return inverted ? 'does not exist' : 'exists';
  else if (operator === 'is' || operator === 'is not') return inverted ? 'is not' : 'is';
};

export const getOperatorOptions = (field: string) => {
  const type = getType(field);
  const operatorMapping = {
    long: [
      {
        label: 'is between',
      },
      {
        label: 'is not between',
      },
    ],
    date_nanos: [
      {
        label: 'is between',
      },
      {
        label: 'is not between',
      },
    ],
    keyword: [],
    default_first: [
      {
        label: 'is',
      },
      {
        label: 'is not',
      },
    ],
    default_last: [
      {
        label: 'exists',
      },
      {
        label: 'does not exist',
      },
    ],
  };
  const operators = [
    ...operatorMapping.default_first,
    ...get(operatorMapping, type),
    ...operatorMapping.default_last,
  ];
  return operators;
};

export const getValueComponent = (
  field: string,
  operator: string,
  value: any,
  setValue: (v: any) => void
) => {
  const textField = (
    <>
      <EuiSpacer size="s" />
      <EuiFlexItem grow={true}>
        <EuiCompressedFormRow label={'Value'} fullWidth>
          <EuiCompressedFieldText
            placeholder={i18n.translate('filterValue.placeholderText', {
              defaultMessage: 'Enter a value',
            })}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            fullWidth
          />
        </EuiCompressedFormRow>
      </EuiFlexItem>
    </>
  );

  const getRangeField = () => {
    const getFromValue = () => {
      if (value?.from) {
        return value.from.includes('\u221E') ? '' : value.from;
      }
      return '';
    };
    const getToValue = () => {
      if (value?.to) {
        return value.to.includes('\u221E') ? '' : value.to;
      }
      return '';
    };
    const setFromValue = (from: string) => {
      setValue({ from: from || '-\u221E', to: getToValue() || '\u221E' });
    };
    const setToValue = (to: string) => {
      setValue({ from: getFromValue() || '-\u221E', to: to || '\u221E' });
    };
    return (
      <>
        <EuiSpacer size="s" />
        <EuiCompressedFormRow label={'Value'}>
          <EuiFormControlLayoutDelimited
            startControl={
              <input
                type="string"
                placeholder={i18n.translate('rangeField.startOfRangePlaceholder', {
                  defaultMessage: 'Start of range',
                })}
                className="euiFieldText"
                value={getFromValue()}
                onChange={(e) => setFromValue(e.target.value)}
              />
            }
            endControl={
              <input
                type="string"
                placeholder={i18n.translate('rangeField.endOfRangePlaceholder', {
                  defaultMessage: 'End of range',
                })}
                className="euiFieldText"
                value={getToValue()}
                onChange={(e) => setToValue(e.target.value)}
              />
            }
          />
        </EuiCompressedFormRow>
      </>
    );
  };

  const getComboBoxField = () => {
    return (
      <>
        <EuiSpacer size="s" />
        <EuiCompressedFormRow label={'Value'}>
          <EuiCompressedComboBox
            placeholder={i18n.translate('comboBox.selectValuePlaceholder', {
              defaultMessage: 'Select a value',
            })}
            options={[
              {
                label: 'true',
              },
              {
                label: 'false',
              },
            ]}
            onChange={setValue}
            selectedOptions={value || []}
            singleSelection={true}
          />
        </EuiCompressedFormRow>
      </>
    );
  };

  if (field === 'error' && (operator === 'is' || operator === 'is not')) {
    return getComboBoxField();
  }

  const valueMapping = {
    is: textField,
    'is not': textField,
    'is between': getRangeField(),
    'is not between': getRangeField(),
    exists: null,
    'does not exist': null,
  };

  return valueMapping[operator];
};
