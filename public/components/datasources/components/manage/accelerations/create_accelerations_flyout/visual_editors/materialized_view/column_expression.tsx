/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiSmallButtonIcon,
  EuiCompressedComboBox,
  EuiExpression,
  EuiCompressedFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiCompressedFormRow,
  EuiPopover,
} from '@elastic/eui';
import producer from 'immer';
import _ from 'lodash';
import React, { useState } from 'react';
import { ACCELERATION_AGGREGRATION_FUNCTIONS } from '../../../../../../../../../common/constants/data_sources';
import {
  AggregationFunctionType,
  CreateAccelerationForm,
  MaterializedViewColumn,
} from '../../../../../../../../../common/types/data_connections';

interface ColumnExpressionProps {
  index: number;
  currentColumnExpressionValue: MaterializedViewColumn;
  columnExpressionValues: MaterializedViewColumn[];
  setColumnExpressionValues: React.Dispatch<React.SetStateAction<MaterializedViewColumn[]>>;
  accelerationFormData: CreateAccelerationForm;
  setAccelerationFormData: React.Dispatch<React.SetStateAction<CreateAccelerationForm>>;
}

export const ColumnExpression = ({
  index,
  currentColumnExpressionValue,
  columnExpressionValues,
  setColumnExpressionValues,
  accelerationFormData,
  setAccelerationFormData,
}: ColumnExpressionProps) => {
  const [isFunctionPopOverOpen, setIsFunctionPopOverOpen] = useState(false);
  const [isAliasPopOverOpen, setIsAliasPopOverOpen] = useState(false);

  const updateColumnExpressionValue = (newValue: MaterializedViewColumn, columnIndex: number) => {
    const updatedArray = [...columnExpressionValues];
    updatedArray[columnIndex] = newValue;
    setColumnExpressionValues(updatedArray);
  };

  const onDeleteColumnExpression = () => {
    const newColumnExpresionValue = [
      ..._.filter(columnExpressionValues, (o) => o.id !== currentColumnExpressionValue.id),
    ];
    setAccelerationFormData(
      producer((accData) => {
        accData.materializedViewQueryData.columnsValues = newColumnExpresionValue;
      })
    );
    setColumnExpressionValues(newColumnExpresionValue);
  };

  const generateColumnValueExpression = (functionName: string, functionParam: string) => {
    if (functionName !== 'window.start') return `${functionName}(${functionParam})`;
    else return `${functionName}`;
  };
  return (
    <EuiFlexItem grow={false}>
      <EuiFlexGroup>
        <EuiFlexItem grow={false}>
          <EuiPopover
            id={'columnFunctionExpression-' + currentColumnExpressionValue.id}
            button={
              <EuiExpression
                description=""
                value={generateColumnValueExpression(
                  currentColumnExpressionValue.functionName,
                  currentColumnExpressionValue.functionParam!
                )}
                isActive={isFunctionPopOverOpen}
                onClick={() => {
                  setIsAliasPopOverOpen(false);
                  setIsFunctionPopOverOpen(true);
                }}
              />
            }
            isOpen={isFunctionPopOverOpen}
            closePopover={() => setIsFunctionPopOverOpen(false)}
            panelPaddingSize="s"
            anchorPosition="downLeft"
          >
            <>
              <EuiFlexGroup>
                <EuiFlexItem grow={false}>
                  <EuiCompressedFormRow label="Aggregate function">
                    <EuiCompressedComboBox
                      singleSelection={{ asPlainText: true }}
                      options={ACCELERATION_AGGREGRATION_FUNCTIONS}
                      selectedOptions={[
                        {
                          label: currentColumnExpressionValue.functionName,
                        },
                      ]}
                      onChange={(functionOption) =>
                        updateColumnExpressionValue(
                          {
                            ...currentColumnExpressionValue,
                            functionName: functionOption[0].label as AggregationFunctionType,
                          },
                          index
                        )
                      }
                      isClearable={false}
                    />
                  </EuiCompressedFormRow>
                </EuiFlexItem>
                {currentColumnExpressionValue.functionName !== 'window.start' && (
                  <EuiFlexItem grow={false}>
                    <EuiCompressedFormRow label="Aggregation field">
                      <EuiCompressedComboBox
                        singleSelection={{ asPlainText: true }}
                        options={[
                          {
                            label: '*',
                            disabled: currentColumnExpressionValue.functionName !== 'count',
                          },
                          ...accelerationFormData.dataTableFields.map((x) => ({
                            label: x.fieldName,
                          })),
                        ]}
                        selectedOptions={[
                          {
                            label: currentColumnExpressionValue.functionParam,
                          },
                        ]}
                        onChange={(fieldOption) =>
                          updateColumnExpressionValue(
                            {
                              ...currentColumnExpressionValue,
                              functionParam: fieldOption[0].label,
                            },
                            index
                          )
                        }
                        isClearable={false}
                      />
                    </EuiCompressedFormRow>
                  </EuiFlexItem>
                )}
              </EuiFlexGroup>
            </>
          </EuiPopover>
        </EuiFlexItem>
        {currentColumnExpressionValue.fieldAlias !== '' && (
          <EuiFlexItem grow={false}>
            <EuiPopover
              id={'columnFunctionExpressionAlias-' + currentColumnExpressionValue.id}
              button={
                <EuiExpression
                  description="AS"
                  color="accent"
                  value={currentColumnExpressionValue.fieldAlias}
                  isActive={isAliasPopOverOpen}
                  onClick={() => {
                    setIsFunctionPopOverOpen(false);
                    setIsAliasPopOverOpen(true);
                  }}
                />
              }
              isOpen={isAliasPopOverOpen}
              closePopover={() => setIsAliasPopOverOpen(false)}
              panelPaddingSize="s"
              anchorPosition="downLeft"
            >
              <EuiCompressedFormRow label="Column alias">
                <EuiCompressedFieldText
                  name="aliasField"
                  value={currentColumnExpressionValue.fieldAlias}
                  onChange={(e) =>
                    updateColumnExpressionValue(
                      { ...currentColumnExpressionValue, fieldAlias: e.target.value },
                      index
                    )
                  }
                />
              </EuiCompressedFormRow>
            </EuiPopover>
          </EuiFlexItem>
        )}
        <EuiFlexItem grow={false}>
          <EuiSmallButtonIcon
            color="danger"
            onClick={onDeleteColumnExpression}
            iconType="trash"
            aria-label="delete-column-expression"
          />
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiFlexItem>
  );
};
