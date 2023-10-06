/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiAccordion,
  EuiDragDropContext,
  EuiDraggable,
  EuiDroppable,
  EuiFieldSearch,
  EuiHorizontalRule,
  EuiPanel,
  EuiSpacer,
  EuiTitle,
} from '@elastic/eui';
import { I18nProvider } from '@osd/i18n/react';
import { isEmpty } from 'lodash';
import React, { useCallback, useContext, useState } from 'react';
import { batch, useDispatch } from 'react-redux';
import { AVAILABLE_FIELDS, SELECTED_FIELDS } from '../../../../../common/constants/explorer';
import { ExplorerFields, IExplorerFields, IField } from '../../../../../common/types/explorer';
import { TabContext } from '../../hooks/use_tab_context';
import { sortFields, updateFields } from '../../redux/slices/field_slice';
import { Field } from './field';

interface ISidebarProps {
  query: string;
  explorerFields: IExplorerFields;
  explorerData: any;
  selectedPattern: string;
  isOverridingPattern: boolean;
  selectedTimestamp: string;
  isOverridingTimestamp: boolean;
  isFieldToggleButtonDisabled: boolean;
  handleOverridePattern: (pattern: IField) => void;
  handleOverrideTimestamp: (timestamp: IField) => void;
  storedExplorerFields: IExplorerFields;
  setStoredExplorerFields: (explorer: IExplorerFields) => void;
}

export const Sidebar = (props: ISidebarProps) => {
  const {
    query,
    explorerFields,
    explorerData,
    selectedPattern,
    isOverridingPattern,
    selectedTimestamp,
    isOverridingTimestamp,
    isFieldToggleButtonDisabled,
    handleOverridePattern,
    handleOverrideTimestamp,
    storedExplorerFields,
    setStoredExplorerFields,
  } = props;
  const dispatch = useDispatch();
  const { tabId } = useContext<any>(TabContext);
  const [showFields, setShowFields] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');

  /**
   * Toggle fields between selected and unselected sets
   * @param fieldState all fields in store
   * @param field field to be toggled
   * @param FieldSetToRemove the set where this field to be removed from
   * @param FieldSetToAdd the set where this field to be added to
   * returns new fields state
   */
  const toggleFields = (
    fieldState: ExplorerFields,
    field: IField,
    fieldSetToRemove: string,
    fieldSetToAdd: string
  ): ExplorerFields => {
    const nextFields = { ...fieldState };
    nextFields[fieldSetToRemove] = nextFields[fieldSetToRemove].filter(
      (fd: IField) => fd.name !== field.name
    );
    nextFields[fieldSetToAdd] = [...nextFields[fieldSetToAdd], field];
    return nextFields;
  };

  const updateStoreFields = (fieldsData: ExplorerFields, tabID: string, modifiedField: string) => {
    batch(() => {
      dispatch(
        updateFields({
          tabId: tabID,
          data: {
            ...fieldsData,
          },
        })
      );
      dispatch(
        sortFields({
          tabId: tabID,
          data: [modifiedField],
        })
      );
    });
  };

  const checkWithStoredFields = () => {
    if (
      explorerFields.selectedFields.length === 0 &&
      storedExplorerFields.selectedFields.length !== 0
    ) {
      return storedExplorerFields;
    }
    return explorerFields;
  };

  const handleAddField = useCallback(
    (field: IField) => {
      const nextFields = toggleFields(
        checkWithStoredFields(),
        field,
        AVAILABLE_FIELDS,
        SELECTED_FIELDS
      );
      updateStoreFields(nextFields, tabId, SELECTED_FIELDS);
      setStoredExplorerFields(nextFields);
    },
    [explorerFields, tabId]
  );

  const handleRemoveField = useCallback(
    (field: IField) => {
      const nextFields = toggleFields(
        checkWithStoredFields(),
        field,
        SELECTED_FIELDS,
        AVAILABLE_FIELDS
      );
      updateStoreFields(nextFields, tabId, AVAILABLE_FIELDS);
      setStoredExplorerFields(nextFields);
    },
    [explorerFields, tabId]
  );

  const onDragEnd = ({}) => {
    console.log('source, destination');
  };

  return (
    <I18nProvider>
      <EuiDragDropContext onDragEnd={onDragEnd}>
        <section className="sidebar-list">
          <div className="dscSidebar__item">
            <EuiFieldSearch
              compressed
              fullWidth
              onChange={(e) => {
                setSearchTerm(e.target.value);
              }}
              placeholder="Search field names"
              value={searchTerm}
              data-test-subj="eventExplorer__sidebarSearch"
            />
          </div>
          <EuiSpacer size="s" />
          <div className="sidebar-list">
            {((explorerData && !isEmpty(explorerData.jsonData) && !isEmpty(explorerFields)) ||
              !isEmpty(explorerFields.availableFields)) && (
              <>
                {explorerFields?.queriedFields && explorerFields.queriedFields?.length > 0 && (
                  <EuiAccordion
                    initialIsOpen
                    id="fieldSelector__queriedFields"
                    buttonContent={
                      <EuiTitle size="xxs">
                        <span>Query fields</span>
                      </EuiTitle>
                    }
                    paddingSize="xs"
                  >
                    <EuiHorizontalRule margin="xs" />
                    <EuiDroppable
                      className="dscSidebarList explorerFieldList--selected"
                      aria-labelledby="queried_fields"
                      data-test-subj={`fieldList-selected`}
                      droppableId="queried_fields_drop"
                      spacing="m"
                    >
                      {explorerFields.queriedFields &&
                        explorerFields.queriedFields.map((field, index) => {
                          return (
                            <EuiDraggable
                              spacing="m"
                              key={`field${field.name}`}
                              data-attr-field={field.name}
                              className="dscSidebar__item sidebar_content"
                              index={index}
                              draggableId={field.name}
                            >
                              <EuiPanel
                                data-attr-field={field.name}
                                paddingSize="s"
                                className="dscSidebar__item"
                                data-test-subj={`fieldList-field`}
                              >
                                <Field
                                  query={query}
                                  field={field}
                                  selectedPattern={selectedPattern}
                                  isOverridingPattern={isOverridingPattern}
                                  handleOverridePattern={handleOverridePattern}
                                  isOverridingTimestamp={isOverridingTimestamp}
                                  selectedTimestamp={selectedTimestamp}
                                  handleOverrideTimestamp={handleOverrideTimestamp}
                                  selected={true}
                                  isFieldToggleButtonDisabled={true}
                                  showTimestampOverrideButton={false}
                                  onToggleField={handleRemoveField}
                                />
                              </EuiPanel>
                            </EuiDraggable>
                          );
                        })}
                    </EuiDroppable>
                  </EuiAccordion>
                )}
                <EuiSpacer size="s" />
                <EuiAccordion
                  initialIsOpen
                  id="fieldSelector__selectedFields"
                  buttonContent={
                    <EuiTitle size="xxs">
                      <span>Selected Fields</span>
                    </EuiTitle>
                  }
                  paddingSize="xs"
                >
                  <EuiHorizontalRule margin="xs" />
                  <EuiDroppable
                    className="dscSidebarList explorerFieldList--selected"
                    aria-labelledby="selected_fields"
                    data-test-subj={`fieldList-selected`}
                    droppableId=""
                    spacing="m"
                  >
                    {explorerData &&
                      !isEmpty(explorerData?.jsonData) &&
                      storedExplorerFields?.selectedFields &&
                      storedExplorerFields?.selectedFields.map((field, index) => {
                        return (
                          <EuiDraggable
                            spacing="m"
                            key={`field${field.name}`}
                            data-attr-field={field.name}
                            className="dscSidebar__item sidebar_content"
                            index={index}
                            draggableId=""
                          >
                            <EuiPanel
                              data-attr-field={field.name}
                              paddingSize="s"
                              className="dscSidebar__item"
                              data-test-subj={`fieldList-field`}
                            >
                              <Field
                                query={query}
                                field={field}
                                selectedPattern={selectedPattern}
                                isOverridingPattern={isOverridingPattern}
                                handleOverridePattern={handleOverridePattern}
                                selectedTimestamp={selectedTimestamp}
                                isOverridingTimestamp={isOverridingTimestamp}
                                handleOverrideTimestamp={handleOverrideTimestamp}
                                selected={true}
                                isFieldToggleButtonDisabled={isFieldToggleButtonDisabled}
                                showTimestampOverrideButton={true}
                                onToggleField={handleRemoveField}
                              />
                            </EuiPanel>
                          </EuiDraggable>
                        );
                      })}
                  </EuiDroppable>
                </EuiAccordion>
                <EuiSpacer size="s" />
                <EuiAccordion
                  initialIsOpen
                  id="fieldSelector__availableFields"
                  buttonContent={
                    <EuiTitle size="xxs">
                      <span>Available Fields</span>
                    </EuiTitle>
                  }
                  paddingSize="xs"
                >
                  <EuiHorizontalRule margin="xs" />
                  <EuiDroppable
                    className={`explorerFieldList explorerFieldList--unpopular ${
                      !showFields ? 'hidden-sm hidden-xs' : ''
                    }`}
                    aria-labelledby="available_fields"
                    data-test-subj={`fieldList-unpopular`}
                    droppableId=""
                    spacing="m"
                  >
                    {storedExplorerFields?.availableFields &&
                      storedExplorerFields?.availableFields
                        .filter(
                          (field) => searchTerm === '' || field.name.indexOf(searchTerm) !== -1
                        )
                        .map((field, index) => {
                          return (
                            <EuiDraggable
                              spacing="m"
                              key={`field${field.name}`}
                              data-attr-field={field.name}
                              className="dscSidebar__item sidebar_content"
                              index={index}
                              draggableId=""
                            >
                              <Field
                                query={query}
                                field={field}
                                selectedPattern={selectedPattern}
                                isOverridingPattern={isOverridingPattern}
                                handleOverridePattern={handleOverridePattern}
                                selectedTimestamp={selectedTimestamp}
                                isOverridingTimestamp={isOverridingTimestamp}
                                handleOverrideTimestamp={handleOverrideTimestamp}
                                onToggleField={handleAddField}
                                selected={false}
                                isFieldToggleButtonDisabled={isFieldToggleButtonDisabled}
                                showTimestampOverrideButton={true}
                              />
                            </EuiDraggable>
                          );
                        })}
                  </EuiDroppable>
                </EuiAccordion>
              </>
            )}
          </div>
        </section>
      </EuiDragDropContext>
    </I18nProvider>
  );
};
