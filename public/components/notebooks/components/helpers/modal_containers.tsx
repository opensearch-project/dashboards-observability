/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiCompressedFieldText,
  EuiCompressedFormRow,
  EuiConfirmModal,
  EuiForm,
  EuiModal,
  EuiModalBody,
  EuiModalFooter,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiOverlayMask,
  EuiSmallButton,
  EuiSmallButtonEmpty,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import React, { useState } from 'react';
import { CoreStart, SavedObjectsStart } from '../../../../../../../src/core/public';
import { DataSourceManagementPluginSetup } from '../../../../../../../src/plugins/data_source_management/public/plugin';
import { dataSourceFilterFn } from '../../../../../common/utils/shared';
import { CustomInputModal } from './custom_modals/custom_input_modal';

/* The file contains helper functions for modal layouts
 * getCustomModal - returns modal with input field
 * getCloneModal - returns a confirm-modal with clone option
 * getDeleteModal - returns a confirm-modal with delete option
 */

export const getCustomModal = (
  runModal: (value: string) => void,
  closeModal: (
    event?: React.KeyboardEvent<HTMLDivElement> | React.MouseEvent<HTMLButtonElement, MouseEvent>
  ) => void,
  labelTxt: string,
  titletxt: string,
  btn1txt: string,
  btn2txt: string,
  openNoteName?: string,
  helpText?: string
) => {
  return (
    <CustomInputModal
      runModal={runModal}
      closeModal={closeModal}
      labelTxt={labelTxt}
      titletxt={titletxt}
      btn1txt={btn1txt}
      btn2txt={btn2txt}
      openNoteName={openNoteName}
      helpText={helpText}
    />
  );
};

export const getCloneModal = (
  onCancel: (
    event?: React.KeyboardEvent<HTMLDivElement> | React.MouseEvent<HTMLButtonElement, MouseEvent>
  ) => void,
  onConfirm: (event?: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void
) => {
  return (
    <EuiOverlayMask>
      <EuiConfirmModal
        title="Clone Notebook"
        onCancel={onCancel}
        onConfirm={onConfirm}
        cancelButtonText="Cancel"
        confirmButtonText="Yes"
        defaultFocusedButton="confirm"
      >
        <p>Do you want to clone this notebook?</p>
      </EuiConfirmModal>
    </EuiOverlayMask>
  );
};

export const getSampleNotebooksModal = (
  onCancel: (
    event?: React.KeyboardEvent<HTMLDivElement> | React.MouseEvent<HTMLButtonElement, MouseEvent>
  ) => void,
  onConfirm: (event?: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void,
  dataSourceEnabled: boolean,
  dataSourceManagement: DataSourceManagementPluginSetup,
  savedObjectsMDSClient: SavedObjectsStart,
  notifications: CoreStart['notifications'],
  handleSelectedDataSourceChange: (
    dataSourceMDSId: string | undefined,
    dataSourceMDSLabel: string | undefined
  ) => void
) => {
  let DataSourceSelector;
  const onSelectedDataSource = (e) => {
    const dataConnectionId = e[0] ? e[0].id : undefined;
    const dataConnectionLabel = e[0] ? e[0].label : undefined;
    handleSelectedDataSourceChange(dataConnectionId, dataConnectionLabel);
  };

  if (dataSourceEnabled) {
    DataSourceSelector = dataSourceManagement.ui.DataSourceSelector;
  }
  return (
    <EuiOverlayMask>
      <EuiConfirmModal
        title="Add sample notebooks"
        onCancel={onCancel}
        onConfirm={onConfirm}
        cancelButtonText="Cancel"
        confirmButtonText="Yes"
        defaultFocusedButton="confirm"
      >
        {dataSourceEnabled && (
          <>
            <EuiTitle size="s">
              <h4>Select a Data source</h4>
            </EuiTitle>
            <DataSourceSelector
              savedObjectsClient={savedObjectsMDSClient.client}
              notifications={notifications}
              onSelectedDataSource={onSelectedDataSource}
              disabled={false}
              fullWidth={false}
              removePrepend={false}
              dataSourceFilter={dataSourceFilterFn}
            />
          </>
        )}
        <EuiSpacer />
        <p>
          Do you want to add sample notebooks? This will also add Dashboards sample flights and logs
          data if they have not been added.
        </p>
      </EuiConfirmModal>
    </EuiOverlayMask>
  );
};

export const getDeleteModal = (
  onCancel: (
    event?: React.KeyboardEvent<HTMLDivElement> | React.MouseEvent<HTMLButtonElement, MouseEvent>
  ) => void,
  onConfirm: (event?: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void,
  title: string,
  message: string,
  confirmMessage?: string
) => {
  return (
    <EuiOverlayMask>
      <EuiConfirmModal
        title={title}
        onCancel={onCancel}
        onConfirm={onConfirm}
        cancelButtonText="Cancel"
        confirmButtonText={confirmMessage || 'Delete'}
        buttonColor="danger"
        defaultFocusedButton="confirm"
      >
        <EuiText size="s">{message}</EuiText>
      </EuiConfirmModal>
    </EuiOverlayMask>
  );
};

export const DeleteNotebookModal = ({
  onCancel,
  onConfirm,
  title,
  message,
}: {
  onCancel: (
    event?: React.KeyboardEvent<HTMLDivElement> | React.MouseEvent<HTMLButtonElement, MouseEvent>
  ) => void;
  onConfirm: (event?: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
  title: string;
  message: string;
}) => {
  const [value, setValue] = useState('');
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
  };
  return (
    <EuiOverlayMask>
      <EuiModal onClose={onCancel} initialFocus="[name=input]">
        <EuiModalHeader>
          <EuiModalHeaderTitle>
            <EuiText size="s">
              <h2>{title}</h2>
            </EuiText>
          </EuiModalHeaderTitle>
        </EuiModalHeader>

        <EuiModalBody>
          <EuiText size="s">{message}</EuiText>
          <EuiText size="s">The action cannot be undone.</EuiText>
          <EuiSpacer />
          <EuiForm>
            <EuiCompressedFormRow label={'To confirm deletion, enter "delete" in the text field'}>
              <EuiCompressedFieldText
                data-test-subj="delete-notebook-modal-input"
                name="input"
                placeholder="delete"
                value={value}
                onChange={(e) => onChange(e)}
              />
            </EuiCompressedFormRow>
          </EuiForm>
        </EuiModalBody>

        <EuiModalFooter>
          <EuiSmallButtonEmpty onClick={onCancel}>Cancel</EuiSmallButtonEmpty>
          <EuiSmallButton
            data-test-subj="delete-notebook-modal-delete-button"
            onClick={() => onConfirm()}
            color="danger"
            fill
            disabled={value !== 'delete'}
          >
            Delete
          </EuiSmallButton>
        </EuiModalFooter>
      </EuiModal>
    </EuiOverlayMask>
  );
};
