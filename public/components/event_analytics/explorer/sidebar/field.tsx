/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiBadge,
  EuiSmallButtonIcon,
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiPopover,
  EuiText,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { isEqual, toUpper, upperFirst } from 'lodash';
import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { DEFAULT_DATA_SOURCE_TYPE } from '../../../../../common/constants/data_sources';
import { IField } from '../../../../../common/types/explorer';
import { FieldIcon } from '../../../common/field_icon';
import { selectSearchMetaData } from '../../../event_analytics/redux/slices/search_meta_data_slice';
import { FieldInsights } from './field_insights';

interface IFieldProps {
  query: string;
  field: IField;
  selectedPattern: string;
  isOverridingPattern: boolean;
  handleOverridePattern: (pattern: IField) => void;
  selectedTimestamp: string;
  isOverridingTimestamp: boolean;
  handleOverrideTimestamp: (timestamp: IField) => void;
  selected: boolean;
  showToggleButton: boolean;
  showTimestampOverrideButton: boolean;
  isFieldToggleButtonDisabled: boolean;
  onToggleField: (field: IField) => void;
  tabId: string;
}

export const Field = (props: IFieldProps) => {
  const {
    query,
    field,
    selectedPattern,
    isOverridingPattern,
    handleOverridePattern,
    selectedTimestamp,
    isOverridingTimestamp,
    handleOverrideTimestamp,
    selected,
    isFieldToggleButtonDisabled = false,
    showTimestampOverrideButton = true,
    onToggleField,
    tabId,
  } = props;

  const [isFieldDetailsOpen, setIsFieldDetailsOpen] = useState(false);
  const explorerSearchMeta = useSelector(selectSearchMetaData)[tabId] || {};
  const isDefaultDataSourceType =
    explorerSearchMeta.datasources?.[0]?.type === DEFAULT_DATA_SOURCE_TYPE;
  const appLogEvents = tabId.startsWith('application-analytics-tab');

  const addLabelAria = i18n.translate('addButtonAriaLabel', {
    defaultMessage: 'Add {field} to table',
    values: { field: field.name },
  });
  const removeLabelAria = i18n.translate('removeButtonAriaLabel', {
    defaultMessage: 'Remove {field} from table',
    values: { field: field.name },
  });

  const togglePopover = () => {
    setIsFieldDetailsOpen((staleState) => !staleState);
  };

  const toggleField = (fields: IField) => {
    onToggleField(fields);
  };

  // hardcoded for demo purposes - remove afterwards
  useEffect(() => {
    if (field.name === 'order_date') {
      handleOverrideTimestamp(field);
    }
  }, []);

  return (
    <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false} className="dscSidebarField">
      <EuiFlexItem grow={false}>
        <FieldIcon type={isEqual(field.type, 'timestamp') ? 'date' : field.type} />
      </EuiFlexItem>
      <EuiFlexItem grow>
        <EuiText size="xs">{field.name}</EuiText>
      </EuiFlexItem>
      <EuiToolTip id="override-pattern" delay="long" content="Override default pattern">
        <>
          {isEqual(field.type, 'string') ? (
            isEqual(selectedPattern, field.name) ? (
              <EuiText size="xs">
                {' '}
                <EuiFlexItem grow={false}>
                  <EuiBadge
                    className="dscSidebarField__actionButton"
                    color="hollow"
                    data-test-subj="eventFields__default-pattern-mark"
                  >
                    Default Pattern
                  </EuiBadge>
                </EuiFlexItem>
              </EuiText>
            ) : isOverridingPattern ? (
              <EuiFlexItem grow={false}>
                <EuiLoadingSpinner className="override_pattern_loading" size="s" />
              </EuiFlexItem>
            ) : (
              <EuiFlexItem grow={false}>
                <EuiButtonIcon
                  aria-labelledby="override_pattern"
                  size="xs"
                  color="text"
                  iconType="inputOutput"
                  onClick={() => handleOverridePattern(field)}
                  data-test-subj="eventExplorer__overrideDefaultPattern"
                  className="dscSidebarField__actionButton"
                  isDisabled={!(isDefaultDataSourceType || appLogEvents)}
                >
                  Override
                </EuiButtonIcon>
              </EuiFlexItem>
            )
          ) : null}
        </>
      </EuiToolTip>
      <EuiToolTip id="override-timestamp" delay="long" content="Override default timestamp">
        <>
          {showTimestampOverrideButton && isEqual(field.type, 'timestamp') ? (
            isEqual(selectedTimestamp, field.name) ? (
              <EuiFlexItem grow={false}>
                <EuiText size="xs">
                  {' '}
                  <EuiBadge
                    className="dscSidebarField__actionButton"
                    color="hollow"
                    data-test-subj="eventFields__default-timestamp-mark"
                  >
                    Default Timestamp
                  </EuiBadge>
                </EuiText>
              </EuiFlexItem>
            ) : isOverridingTimestamp ? (
              <EuiFlexItem grow={false}>
                <EuiLoadingSpinner className="override_timestamp_loading" size="s" />
              </EuiFlexItem>
            ) : (
              <EuiFlexItem grow={false}>
                <EuiButtonIcon
                  aria-labelledby="override_timestamp"
                  size="xs"
                  color="text"
                  iconType="inputOutput"
                  onClick={() => handleOverrideTimestamp(field)}
                  data-test-subj="eventExplorer__overrideDefaultTimestamp"
                  className="dscSidebarField__actionButton"
                  isDisabled={!(isDefaultDataSourceType || appLogEvents)}
                >
                  Override
                </EuiButtonIcon>
              </EuiFlexItem>
            )
          ) : null}
        </>
      </EuiToolTip>
      <EuiFlexItem grow={false}>
        <EuiToolTip delay="long" content="inspect">
          <EuiPopover
            ownFocus
            display="block"
            isOpen={isFieldDetailsOpen}
            closePopover={() => setIsFieldDetailsOpen(false)}
            anchorPosition="rightUp"
            panelClassName="explorerSidebarItem__fieldPopoverPanel"
            button={
              <EuiButtonIcon
                iconType="inspect"
                size="xs"
                onClick={togglePopover}
                aria-label={'inspect'}
                className="dscSidebarField__actionButton"
                isDisabled={!(isDefaultDataSourceType || appLogEvents)}
              />
            }
          >
            <EuiFlexGroup justifyContent="spaceBetween">
              <EuiFlexItem>
                <EuiTitle size="xs">
                  <h4>{toUpper(field.name)}</h4>
                </EuiTitle>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>{upperFirst(field.type)}</EuiFlexItem>
            </EuiFlexGroup>

            <FieldInsights field={field} query={query} />
          </EuiPopover>
        </EuiToolTip>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiToolTip
          delay="long"
          content={
            isFieldToggleButtonDisabled
              ? "Toggle button is disabled on query contains 'stats' or no hits for the search"
              : selected
              ? 'Remove field from table'
              : 'Add field as column'
          }
        >
          <>
            {isFieldToggleButtonDisabled ? (
              <EuiSmallButtonIcon
                color={selected ? 'danger' : 'primary'}
                iconType={selected ? 'cross' : 'plusInCircleFilled'}
                isDisabled
                data-test-subj={`fieldToggle-${field.name}`}
                aria-label={selected ? removeLabelAria : addLabelAria}
                className="dscSidebarField__actionButton"
              />
            ) : (
              <EuiSmallButtonIcon
                color={selected ? 'danger' : 'primary'}
                iconType={selected ? 'cross' : 'plusInCircleFilled'}
                onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                  if (e.type === 'click') {
                    e.currentTarget.focus();
                  }
                  e.preventDefault();
                  e.stopPropagation();
                  toggleField(field);
                }}
                data-test-subj={`fieldToggle-${field.name}`}
                aria-label={selected ? removeLabelAria : addLabelAria}
                className="dscSidebarField__actionButton"
              />
            )}
          </>
        </EuiToolTip>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
