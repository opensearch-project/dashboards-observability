/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiDragDropContext,
  EuiDraggable,
  EuiDroppable,
  EuiFieldSearch,
  EuiTitle,
  EuiSplitPanel,
  EuiPanel,
} from '@elastic/eui';
import { FormattedMessage, I18nProvider } from '@osd/i18n/react';
import { isEmpty } from 'lodash';
import React, { useCallback, useEffect, useState } from 'react';
import { batch, useDispatch } from 'react-redux';
import { AVAILABLE_FIELDS, SELECTED_FIELDS } from '../../../../../common/constants/explorer';
import { ExplorerFields, IExplorerFields, IField } from '../../../../../common/types/explorer';
import { sortFields, updateFields } from '../../redux/slices/field_slice';
import { Field } from './field';
import { getFieldTypes } from '../../utils/utils';

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
  const [showFields, setShowFields] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');

  /**
   * Toggle fields between selected and unselected sets
   * @param fieldState all fields in store
   * @param field field to be toggled
   * @param FieldSetToRemove the set where this field to be removed from
   * @param FieldSetToAdd the set where this field to be added to
   * @param indexPos position in which field should be added, default value is 0
   * @returns new fields state
   */
  const toggleFields = (
    fieldState: ExplorerFields,
    field: IField,
    fieldSetToRemove: string,
    fieldSetToAdd: string,
    indexPos: number = 0
  ): ExplorerFields => {
    const nextFields = { ...fieldState };

    // find and remove field
    nextFields[fieldSetToRemove] = nextFields[fieldSetToRemove].filter(
      (fd: IField) => fd.name !== field.name
    );

    // add field at specified index, will resolve to 0 if not specified
    const addedFieldSet = [...nextFields[fieldSetToAdd]]; // copies value, not reference
    addedFieldSet.splice(indexPos, 0, field);
    nextFields[fieldSetToAdd] = addedFieldSet;

    return nextFields;
  };

  const updateStoreFields = useCallback(
    (fieldsData: ExplorerFields) => {
      dispatch(
        updateFields({
          tabId,
          data: {
            ...fieldsData,
          },
        })
      );
    },
    [explorerFields, tabId]
  );

  const sortStoreFields = useCallback(
    (fieldName: string) => {
      dispatch(
        sortFields({
          tabId,
          data: [fieldName],
        })
      );
    },
    [explorerFields, tabId]
  );

  // handling moving a field from available to selected
  const handleAddField = useCallback(
    (field: IField, indexPos?: number) => {
      updateStoreFields(
        toggleFields(explorerFields, field, AVAILABLE_FIELDS, SELECTED_FIELDS, indexPos)
      );
    },
    [explorerFields, tabId, updateStoreFields]
  );

  const handleRemoveField = useCallback(
    (field: IField) => {
      // update to remove from selected fields and sort available fields
      updateStoreFields(toggleFields(explorerFields, field, SELECTED_FIELDS, AVAILABLE_FIELDS));
      sortStoreFields(AVAILABLE_FIELDS);
    },
    [explorerFields, tabId, updateStoreFields, sortStoreFields]
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
        handleAddField(
          { name: draggableId, type: getFieldTypes(draggableId, explorerFields) },
          destination.index
        );
      } else if (destination.droppableId === 'AVAILABLE FIELDS') {
        handleRemoveField({ name: draggableId, type: getFieldTypes(draggableId, explorerFields) });
      }
    } else if (
      destination.droppableId === 'SELECTED FIELDS' &&
      source.droppableId === 'SELECTED FIELDS'
    ) {
      // removes from selected and adds back into selected at specified index position
      updateStoreFields(
        toggleFields(
          explorerFields,
          { name: draggableId, type: getFieldTypes(draggableId, explorerFields) },
          SELECTED_FIELDS,
          SELECTED_FIELDS,
          destination.index
        )
      );
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
