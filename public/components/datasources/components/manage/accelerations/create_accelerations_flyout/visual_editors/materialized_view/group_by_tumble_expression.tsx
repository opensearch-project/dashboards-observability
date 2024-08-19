/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiCompressedComboBox,
  EuiComboBoxOptionOption,
  EuiExpression,
  EuiCompressedFieldNumber,
  EuiFlexGroup,
  EuiFlexItem,
  EuiCompressedFormRow,
  EuiPopover,
  EuiCompressedSelect,
} from '@elastic/eui';
import producer from 'immer';
import React, { useState } from 'react';
import {
  ACCELERATION_TIME_INTERVAL,
  SPARK_TIMESTAMP_DATATYPE,
} from '../../../../../../../../../common/constants/data_sources';
import {
  CreateAccelerationForm,
  GroupByTumbleType,
} from '../../../../../../../../../common/types/data_connections';
import { hasError, pluralizeTime } from '../../create/utils';

interface GroupByTumbleExpressionProps {
  accelerationFormData: CreateAccelerationForm;
  setAccelerationFormData: React.Dispatch<React.SetStateAction<CreateAccelerationForm>>;
}

export const GroupByTumbleExpression = ({
  accelerationFormData,
  setAccelerationFormData,
}: GroupByTumbleExpressionProps) => {
  const [IsGroupPopOverOpen, setIsGroupPopOverOpen] = useState(false);
  const [groupbyValues, setGroupByValues] = useState<GroupByTumbleType>({
    timeField: '',
    tumbleWindow: 1,
    tumbleInterval: ACCELERATION_TIME_INTERVAL[2].value,
  });

  const updateGroupByStates = (newGroupByValue: GroupByTumbleType) => {
    setGroupByValues(newGroupByValue);
    setAccelerationFormData(
      producer((accData) => {
        accData.materializedViewQueryData.groupByTumbleValue = newGroupByValue;
      })
    );
  };

  const onChangeTumbleWindow = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newGroupByValue = { ...groupbyValues, tumbleWindow: parseInt(e.target.value, 10) };
    updateGroupByStates(newGroupByValue);
  };

  const onChangeTumbleInterval = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newGroupByValue = { ...groupbyValues, tumbleInterval: e.target.value };
    updateGroupByStates(newGroupByValue);
  };

  const onChangeTimeField = (selectedOptions: EuiComboBoxOptionOption[]) => {
    if (selectedOptions.length > 0) {
      const newGroupByValue = { ...groupbyValues, timeField: selectedOptions[0].label };
      updateGroupByStates(newGroupByValue);
    }
  };

  return (
    <EuiFlexItem grow={false}>
      <EuiPopover
        id="groupByTumblePopOver"
        button={
          <EuiExpression
            description="GROUP BY"
            value={`TUMBLE(${groupbyValues.timeField}, '${groupbyValues.tumbleWindow} ${
              groupbyValues.tumbleInterval
            }${pluralizeTime(groupbyValues.tumbleWindow)}')`}
            isActive={IsGroupPopOverOpen}
            onClick={() => setIsGroupPopOverOpen(true)}
            isInvalid={
              hasError(accelerationFormData.formErrors, 'materializedViewError') &&
              groupbyValues.timeField === ''
            }
          />
        }
        isOpen={IsGroupPopOverOpen}
        closePopover={() => setIsGroupPopOverOpen(false)}
        panelPaddingSize="s"
        anchorPosition="downLeft"
      >
        <EuiFlexGroup>
          <EuiFlexItem>
            <EuiCompressedFormRow label="Time Field">
              <EuiCompressedComboBox
                style={{ minWidth: '200px' }}
                placeholder="Select one or more options"
                singleSelection={{ asPlainText: true }}
                options={accelerationFormData.dataTableFields
                  .filter((value) => value.dataType.includes(SPARK_TIMESTAMP_DATATYPE))
                  .map((value) => ({ label: value.fieldName }))}
                selectedOptions={[{ label: groupbyValues.timeField }]}
                onChange={onChangeTimeField}
                isClearable={false}
              />
            </EuiCompressedFormRow>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiCompressedFormRow label="Tumble Window">
              <EuiCompressedFieldNumber
                value={groupbyValues.tumbleWindow}
                onChange={onChangeTumbleWindow}
                min={1}
              />
            </EuiCompressedFormRow>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiCompressedFormRow label="Tumble Interval">
              <EuiCompressedSelect
                value={groupbyValues.tumbleInterval}
                onChange={onChangeTumbleInterval}
                options={ACCELERATION_TIME_INTERVAL}
              />
            </EuiCompressedFormRow>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPopover>
    </EuiFlexItem>
  );
};
