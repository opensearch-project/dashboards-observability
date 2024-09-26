/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Fragment, useCallback } from 'react';
import {
  EuiButton,
  EuiAccordion,
  EuiCompressedFormRow,
  EuiCompressedFieldNumber,
  EuiColorPicker,
  EuiSpacer,
  EuiIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiCompressedFieldText,
  htmlIdGenerator,
  EuiToolTip,
} from '@elastic/eui';
import { isEmpty } from 'lodash';

export interface ThresholdUnitType {
  thid: string;
  name: string;
  color: string;
  value: number;
  isReadOnly?: boolean;
}

export const ConfigThresholds = ({
  visualizations,
  schemas,
  vizState = [],
  handleConfigChange,
  sectionName = 'Thresholds',
  props,
}: any) => {
  const { type } = visualizations?.vis;
  const addButtonText = '+ Add threshold';
  const AddButtonTextWrapper = () =>
    props?.maxLimit && !isEmpty(vizState) && vizState.length === props.maxLimit ? (
      <EuiToolTip position="top" content="Only one threshold can be applied">
        <Fragment key="tooltip-button">{addButtonText}</Fragment>
      </EuiToolTip>
    ) : (
      <Fragment key="tooltip-button">{addButtonText}</Fragment>
    );

  const getThresholdUnit = () => {
    return {
      thid: htmlIdGenerator('thr')(),
      name: '',
      color: '#FC0505',
      value: 0,
      isReadOnly: false,
    };
  };

  const handleAddThreshold = useCallback(() => {
    let res = vizState;
    if (isEmpty(vizState)) res = [];
    handleConfigChange([getThresholdUnit(), ...res]);
  }, [vizState, handleConfigChange]);

  const handleThresholdChange = useCallback(
    (thrId, thrName) => {
      return (event: any) => {
        handleConfigChange([
          ...vizState.map((th: ThresholdUnitType) => {
            if (thrId !== th.thid) return th;
            return {
              ...th,
              [thrName]: (thrName === 'color' ? event : event?.target?.value) || '',
            };
          }),
        ]);
      };
    },
    [vizState, handleConfigChange]
  );

  const handleThresholdDelete = useCallback(
    (thrId) => {
      return () => {
        handleConfigChange([...vizState.filter((th: ThresholdUnitType) => th.thid !== thrId)]);
      };
    },
    [vizState, handleConfigChange]
  );
  return (
    <EuiAccordion
      initialIsOpen
      id={`configPanel__${sectionName}`}
      buttonContent={sectionName}
      paddingSize="s"
    >
      <EuiButton
        data-test-subj="addThresholdButton"
        fullWidth
        size="s"
        onClick={handleAddThreshold}
        {...(props?.maxLimit && {
          isDisabled: !isEmpty(vizState) && vizState.length === props.maxLimit,
        })}
      >
        <AddButtonTextWrapper />
      </EuiButton>
      <EuiSpacer size="s" />
      {!isEmpty(vizState) &&
        vizState.map((thr: ThresholdUnitType) => {
          return (
            <Fragment key={thr.thid}>
              <EuiCompressedFormRow fullWidth label="">
                <EuiFlexGroup alignItems="center" gutterSize="xs">
                  <EuiFlexItem grow={3}>
                    <EuiCompressedFormRow helpText="color">
                      <EuiColorPicker
                        fullWidth
                        onChange={handleThresholdChange(thr.thid, 'color')}
                        color={thr.color}
                      />
                    </EuiCompressedFormRow>
                  </EuiFlexItem>
                  <EuiFlexItem grow={5}>
                    <EuiCompressedFormRow helpText="name">
                      <EuiCompressedFieldText
                        onChange={handleThresholdChange(thr.thid, 'name')}
                        value={thr.name || ''}
                        arial-label="Input threshold name"
                        data-test-subj="nameFieldText"
                        readOnly={thr.isReadOnly}
                      />
                    </EuiCompressedFormRow>
                  </EuiFlexItem>
                  <EuiFlexItem grow={5}>
                    <EuiCompressedFormRow helpText="value">
                      <EuiCompressedFieldNumber
                        fullWidth
                        placeholder="threshold value"
                        value={thr.value || 0}
                        onChange={handleThresholdChange(thr.thid, 'value')}
                        aria-label="Input threshold value"
                        data-test-subj="valueFieldNumber"
                        readOnly={thr.isReadOnly}
                      />
                    </EuiCompressedFormRow>
                  </EuiFlexItem>
                  {!thr.isReadOnly && (
                    <EuiFlexItem grow={1}>
                      <EuiCompressedFormRow>
                        <EuiIcon type="trash" onClick={handleThresholdDelete(thr.thid)} />
                      </EuiCompressedFormRow>
                    </EuiFlexItem>
                  )}
                </EuiFlexGroup>
              </EuiCompressedFormRow>
            </Fragment>
          );
        })}
    </EuiAccordion>
  );
};
