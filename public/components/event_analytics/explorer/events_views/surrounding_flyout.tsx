/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import './docView.scss';
import React, { useEffect, useState, Fragment } from 'react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiCallOut,
  EuiFieldNumber,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiFormRow,
  EuiSpacer,
  EuiText,
  EuiTitle,
  EuiDataGrid,
  EuiDescriptionList,
  EuiDescriptionListTitle,
  EuiDescriptionListDescription,
} from '@elastic/eui';
import moment from 'moment';
import { FlyoutContainers } from '../../../common/flyout_containers';
import { IDocType } from './docViewRow';
import { IField } from '../../../../../common/types/explorer';
import { fetchSurroundingData, rangeNumDocs } from '../../utils';
import { DATE_DISPLAY_FORMAT } from '../../../../../common/constants/explorer';
import PPLService from '../../../../services/requests/ppl';

interface Props {
  setDetailsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  doc: IDocType;
  timeStampField: string;
  setOpenTraces: React.Dispatch<React.SetStateAction<boolean>>;
  setSurroundingEventsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  pplService: PPLService;
  rawQuery: string;
  selectedCols: IField[];
  getTds: (doc: IDocType, selectedCols: IField[], isFlyout: boolean) => JSX.Element[];
  toggleSize: boolean;
  setToggleSize: React.Dispatch<React.SetStateAction<boolean>>;
  dataGridColumns: any;
  dataGridColumnVisibility: any;
  sortingFields: any;
  rowHeightsOptions: any;
  rows: any;
}

export const SurroundingFlyout = ({
  setDetailsOpen,
  doc,
  timeStampField,
  setOpenTraces,
  setSurroundingEventsOpen,
  pplService,
  rawQuery,
  selectedCols,
  getTds,
  toggleSize,
  setToggleSize,
  dataGridColumns,
  dataGridColumnVisibility,
  sortingFields,
  rowHeightsOptions,
}: Props) => {
  const [numNewEvents, setNumNewEvents] = useState(5);
  const [valueOldEvents, setNumOldEvents] = useState(5);
  const [loadingNewEvents, setLoadingNewEvents] = useState(false);
  const [loadingOldEvents, setLoadingOldEvents] = useState(false);
  const [oldEventsError, setOldEventsError] = useState('');
  const [newEventsError, setNewEventsError] = useState('');
  const [newEventsData, setNewEventsData] = useState<any[]>([]);
  const [oldEventsData, setOldEventsData] = useState<any[]>([]);

  const closeFlyout = () => {
    setDetailsOpen(false);
    setOpenTraces(false);
    setSurroundingEventsOpen(false);
  };

  const openDetailsFlyout = () => {
    setDetailsOpen(true);
    setOpenTraces(false);
    setSurroundingEventsOpen(false);
  };

  const loadData = async (typeOfDocs: 'new' | 'old', value: number) => {
    const numDocs = rangeNumDocs(value);
    let resultCount = 0;
    if (typeOfDocs === 'new') {
      resultCount = await fetchSurroundingData(
        pplService,
        rawQuery,
        timeStampField,
        doc[timeStampField],
        numDocs,
        'new',
        setNewEventsData,
        setNewEventsError,
        setLoadingNewEvents,
        selectedCols,
        getTds
      );
      setNumNewEvents(resultCount);
    } else {
      resultCount = await fetchSurroundingData(
        pplService,
        rawQuery,
        timeStampField,
        doc[timeStampField],
        numDocs,
        'old',
        setOldEventsData,
        setOldEventsError,
        setLoadingOldEvents,
        selectedCols,
        getTds
      );
      setNumOldEvents(resultCount);
    }
  };

  const renderCells = ({ rowIndex, columnId }: { rowIndex: number; columnId: string }) => {
    let actualIndex: number;
    let rowDoc: any;

    if (rowIndex < newEventsData.length) {
      // within newEvents section of table, pull data from there
      actualIndex = rowIndex;
      rowDoc = newEventsData[rowIndex];
    } else if (rowIndex === newEventsData.length) {
      // is the selected row
      actualIndex = rowIndex;
      rowDoc = doc;
    } else if (rowIndex > newEventsData.length) {
      // within oldEvents section of table
      actualIndex = rowIndex - (newEventsData.length + 1);
      rowDoc = oldEventsData[actualIndex];
    } else {
      throw Error();
    }

    if (columnId === '_source') {
      return (
        <EuiDescriptionList type="inline" compressed>
          {Object.keys(rowDoc).map((key) => (
            <Fragment key={key}>
              <EuiDescriptionListTitle className="osdDescriptionListFieldTitle">
                {key}
              </EuiDescriptionListTitle>
              <EuiDescriptionListDescription>{rowDoc[key]}</EuiDescriptionListDescription>
            </Fragment>
          ))}
        </EuiDescriptionList>
      );
    }
    if (columnId === 'timestamp') {
      return `${moment(rowDoc[columnId]).format(DATE_DISPLAY_FORMAT)}`;
    }
    return `${rowDoc[columnId]}`;
  };

  const loadButton = (typeOfDocs: 'new' | 'old') => {
    if (typeOfDocs === 'new') {
      loadData(typeOfDocs, numNewEvents + 5);
    } else {
      loadData(typeOfDocs, valueOldEvents + 5);
    }
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
    typeOfDocs: 'new' | 'old'
  ) => {
    if (event.key === 'Enter') {
      loadData(typeOfDocs, typeOfDocs === 'new' ? numNewEvents : valueOldEvents);
    }
  };

  const onChangeNewEvents = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNumNewEvents(parseInt(e.target.value, 10));
  };

  const onChangeOldEvents = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNumOldEvents(parseInt(e.target.value, 10));
  };

  const flyoutHeader = (
    <EuiFlyoutHeader hasBorder>
      <EuiFlexGroup>
        <EuiFlexItem>
          <EuiTitle size="s">
            <h2 id="surroundingFyout" className="vertical-center">
              View surrounding events
            </h2>
          </EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButtonIcon
            className="events-flyout-resize"
            color="text"
            size="m"
            aria-label="Resize"
            title="Resize"
            iconType={toggleSize ? 'menuLeft' : 'menuRight'}
            aria-pressed={toggleSize}
            onClick={() => {
              setToggleSize((isOn) => !isOn);
            }}
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButton
            onClick={openDetailsFlyout}
            className="header-button"
            iconType="sortRight"
            iconSide="right"
          >
            View event details
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiFlyoutHeader>
  );

  const getInputForm = (
    iconType: string,
    onChange: React.ChangeEventHandler<HTMLInputElement>,
    value: number,
    typeOfDocs: 'new' | 'old'
  ) => {
    return (
      <EuiFlexGroup>
        <EuiFlexItem grow={false}>
          <EuiFormRow>
            <EuiButtonEmpty
              isLoading={typeOfDocs === 'new' ? loadingNewEvents : loadingOldEvents}
              iconSide="left"
              onClick={() => loadButton(typeOfDocs)}
              iconType={iconType}
            >
              Load
            </EuiButtonEmpty>
          </EuiFormRow>
        </EuiFlexItem>
        <EuiFlexItem grow={false} className="cnt-picker">
          <EuiFormRow>
            <EuiFieldNumber
              value={value}
              onChange={(e) => onChange(e)}
              aria-label={typeOfDocs === 'new' ? 'fetch newer events' : 'fetch older events'}
              min={0}
              max={10000}
              onKeyDown={(e) => handleKeyDown(e, typeOfDocs)}
            />
          </EuiFormRow>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiFormRow display="center">
            <EuiText>{typeOfDocs === 'new' ? 'newer' : 'older'} events</EuiText>
          </EuiFormRow>
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  };

  const flyoutBody = (
    <EuiFlyoutBody>
      <div className="obsExplorer">
        {getInputForm('arrowUp', onChangeNewEvents, numNewEvents, 'new')}
        <EuiSpacer size="s" />
        <div>
          {newEventsError !== '' && (
            <EuiCallOut iconType="bolt" title={newEventsError} color="warning" />
          )}
        </div>
        <EuiDataGrid
          aria-labelledby="aria-labelledby"
          data-test-subj="docTable"
          columns={dataGridColumns}
          columnVisibility={dataGridColumnVisibility}
          rowCount={newEventsData.length + oldEventsData.length + 1}
          renderCellValue={renderCells}
          sorting={{
            columns: sortingFields.current, // TODO: change this to only have timestamp from new to old
            onSort: () => {},
          }}
          toolbarVisibility={false}
          rowHeightsOptions={rowHeightsOptions}
          height={800}
        />
        <div>
          {oldEventsError !== '' && (
            <EuiCallOut iconType="bolt" title={oldEventsError} color="warning" />
          )}
        </div>
        <EuiSpacer size="s" />
        {getInputForm('arrowDown', onChangeOldEvents, valueOldEvents, 'old')}
      </div>
    </EuiFlyoutBody>
  );

  const flyoutFooter = <></>;

  useEffect(() => {
    loadData('new', 5);
    loadData('old', 5);
  }, []);

  return (
    <FlyoutContainers
      closeFlyout={closeFlyout}
      flyoutHeader={flyoutHeader}
      flyoutBody={flyoutBody}
      flyoutFooter={flyoutFooter}
      ariaLabel={'surroundingFyout'}
      size={toggleSize ? 'm' : 'l'}
    />
  );
};
