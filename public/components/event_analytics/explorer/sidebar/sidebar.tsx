/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiDragDropContext,
  EuiDraggable,
  EuiDroppable,
  EuiFieldSearch,
  EuiPanel,
  EuiSplitPanel,
  EuiTitle,
} from '@elastic/eui';
import { FormattedMessage, I18nProvider } from '@osd/i18n/react';
import isEmpty from 'lodash/isEmpty';
import React, { useCallback, useState } from 'react';
import { batch, useDispatch } from 'react-redux';
import { AVAILABLE_FIELDS, SELECTED_FIELDS } from '../../../../../common/constants/explorer';
import { ExplorerFields, IExplorerFields, IField } from '../../../../../common/types/explorer';
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
  tabId: string;
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
    tabId,
  } = props;
  const dispatch = useDispatch();
  const [showFields, _setShowFields] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // method to return the type of a field from its name
  const getFieldTypes = (newFieldName: string) => {
    let fieldType: string = '';
    explorerFields.availableFields.map((field) => {
      if (field.name === newFieldName) fieldType = field.type;
    });
    explorerFields.selectedFields.map((field) => {
      if (field.name === newFieldName) fieldType = field.type;
    });
    return fieldType;
  };

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

  const handleAddField = useCallback(
    (field: IField) => {
      updateStoreFields(
        toggleFields(explorerFields, field, AVAILABLE_FIELDS, SELECTED_FIELDS),
        tabId,
        SELECTED_FIELDS
      );
    },
    [explorerFields, tabId]
  );

  const handleRemoveField = useCallback(
    (field: IField) => {
      updateStoreFields(
        toggleFields(explorerFields, field, SELECTED_FIELDS, AVAILABLE_FIELDS),
        tabId,
        AVAILABLE_FIELDS
      );
    },
    [explorerFields, tabId]
  );

  const onDragEnd = ({
    destination,
    source,
    draggableId,
  }: {
    destination: any;
    source: any;
    draggableId: string;
  }) => {
    // check if the destination and source are the same area
    if (destination.droppableId !== source.droppableId) {
      // if dropped into the selected fields: add, if dropped into available: remove
      if (destination.droppableId === 'SELECTED FIELDS') {
        handleAddField({ name: draggableId, type: getFieldTypes(draggableId) });
      } else if (destination.droppableId === 'AVAILABLE FIELDS') {
        handleRemoveField({ name: draggableId, type: getFieldTypes(draggableId) });
      }
    }
  };

  return (
    <I18nProvider>
      <EuiDragDropContext onDragEnd={onDragEnd}>
        <EuiSplitPanel.Outer
          className="sidebar-list eui-yScroll"
          borderRadius="none"
          color="transparent"
        >
          <EuiSplitPanel.Inner grow={false} paddingSize="s">
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
          </EuiSplitPanel.Inner>
          <EuiSplitPanel.Inner className="eui-yScroll" paddingSize="none">
            {((explorerData && !isEmpty(explorerData.jsonData) && !isEmpty(explorerFields)) ||
              !isEmpty(explorerFields.availableFields)) && (
              <>
                {explorerFields?.queriedFields && explorerFields.queriedFields?.length > 0 && (
                  <>
                    <EuiTitle
                      size="xxxs"
                      id="obs_queried_fields"
                      className="dscSideBarFieldListHeader"
                    >
                      <h3>
                        <FormattedMessage
                          id="discover.fieldChooser.filter.selectedFieldsTitle"
                          defaultMessage="Query fields"
                        />
                      </h3>
                    </EuiTitle>
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
                              index={index}
                              draggableId={`queriedField-${field.name}`}
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
                                  tabId={tabId}
                                />
                              </EuiPanel>
                            </EuiDraggable>
                          );
                        })}
                    </EuiDroppable>
                  </>
                )}
                <EuiTitle
                  size="xxxs"
                  id="obs_selected_fields"
                  className="dscSideBarFieldListHeader"
                >
                  <h3>
                    <FormattedMessage
                      id="discover.fieldChooser.filter.selectedFieldsTitle"
                      defaultMessage="Selected fields"
                    />
                  </h3>
                </EuiTitle>
                <EuiDroppable
                  className="dscSidebarList explorerFieldList--selected"
                  aria-labelledby="selected_fields"
                  data-test-subj={`fieldList-selected`}
                  droppableId="SELECTED FIELDS"
                  spacing="m"
                >
                  {explorerData &&
                    !isEmpty(explorerData?.jsonData) &&
                    explorerFields?.selectedFields &&
                    explorerFields?.selectedFields.map((field, index) => {
                      return (
                        <EuiDraggable
                          spacing="m"
                          key={`field${field.name}`}
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
                              selectedTimestamp={selectedTimestamp}
                              isOverridingTimestamp={isOverridingTimestamp}
                              handleOverrideTimestamp={handleOverrideTimestamp}
                              selected={true}
                              isFieldToggleButtonDisabled={isFieldToggleButtonDisabled}
                              showTimestampOverrideButton={true}
                              onToggleField={handleRemoveField}
                              tabId={tabId}
                            />
                          </EuiPanel>
                        </EuiDraggable>
                      );
                    })}
                </EuiDroppable>
                <EuiTitle
                  size="xxxs"
                  id="obs_available_fields"
                  className="dscSideBarFieldListHeader"
                >
                  <h3>
                    <FormattedMessage
                      id="discover.fieldChooser.filter.availableFieldsTitle"
                      defaultMessage="Available fields"
                    />
                  </h3>
                </EuiTitle>
                <EuiDroppable
                  className={`explorerFieldList explorerFieldList--unpopular ${
                    !showFields ? 'hidden-sm hidden-xs' : ''
                  }`}
                  aria-labelledby="available_fields"
                  data-test-subj={`fieldList-unpopular`}
                  droppableId="AVAILABLE FIELDS"
                  spacing="m"
                >
                  {explorerFields?.availableFields &&
                    explorerFields?.availableFields
                      .filter((field) => searchTerm === '' || field.name.indexOf(searchTerm) !== -1)
                      .map((field, index) => {
                        return (
                          <EuiDraggable
                            spacing="m"
                            key={`field${field.name}`}
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
                                selectedTimestamp={selectedTimestamp}
                                isOverridingTimestamp={isOverridingTimestamp}
                                handleOverrideTimestamp={handleOverrideTimestamp}
                                onToggleField={handleAddField}
                                selected={false}
                                isFieldToggleButtonDisabled={isFieldToggleButtonDisabled}
                                showTimestampOverrideButton={true}
                                tabId={tabId}
                              />
                            </EuiPanel>
                          </EuiDraggable>
                        );
                      })}
                </EuiDroppable>
              </>
            )}
          </EuiSplitPanel.Inner>
        </EuiSplitPanel.Outer>
      </EuiDragDropContext>
    </I18nProvider>
  );
};
