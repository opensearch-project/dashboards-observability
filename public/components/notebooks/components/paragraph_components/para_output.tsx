/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiCodeBlock, EuiSpacer, EuiText } from '@elastic/eui';
import MarkdownRender from '@nteract/markdown';
import { Media } from '@nteract/outputs';
import React, { useState } from 'react';
import { VisualizationContainer } from '../../../../components/custom_panels/panel_modules/visualization_container';
import PPLService from '../../../../services/requests/ppl';
import { CoreStart } from '../../../../../../../src/core/public';
import {
  DashboardContainerInput,
  DashboardStart,
} from '../../../../../../../src/plugins/dashboard/public';
import { ParaType } from '../../../../../common/types/notebooks';
import { getOSDHttp, getPPLService, uiSettingsService } from '../../../../../common/utils';
import { QueryDataGridMemo } from './para_query_grid';
import { convertDateTime } from '../../../common/query_utils';

const createQueryColumns = (jsonColumns: any[]) => {
  let index = 0;
  const datagridColumns = [];
  for (index = 0; index < jsonColumns.length; ++index) {
    const datagridColumnObject = {
      id: jsonColumns[index].name,
      displayAsText: jsonColumns[index].name,
    };
    datagridColumns.push(datagridColumnObject);
  }
  return datagridColumns;
};

const getQueryOutputData = (queryObject: any) => {
  const data = [];
  let index = 0;
  let schemaIndex = 0;
  for (index = 0; index < queryObject.datarows.length; ++index) {
    const datarowValue = {};
    for (schemaIndex = 0; schemaIndex < queryObject.schema.length; ++schemaIndex) {
      const columnName = queryObject.schema[schemaIndex].name;
      if (typeof queryObject.datarows[index][schemaIndex] === 'object') {
        datarowValue[columnName] = JSON.stringify(queryObject.datarows[index][schemaIndex]);
      } else if (typeof queryObject.datarows[index][schemaIndex] === 'boolean') {
        datarowValue[columnName] = queryObject.datarows[index][schemaIndex].toString();
      } else {
        datarowValue[columnName] = queryObject.datarows[index][schemaIndex];
      }
    }
    data.push(datarowValue);
  }
  return data;
};

const QueryPara = ({ inp, val }) => {
  const inputQuery = inp.substring(4, inp.length);
  const queryObject = JSON.parse(val);

  if (queryObject.hasOwnProperty('error')) return <EuiCodeBlock>{val}</EuiCodeBlock>;

  const columns = createQueryColumns(queryObject.schema);
  const [visibleColumns, setVisibleColumns] = useState(columns.map((c) => c.id));
  const data = getQueryOutputData(queryObject);
  return (
    <div>
      <EuiText key={'query-input-key'} className={'wrapAll'}>
        <b>{inputQuery}</b>
      </EuiText>
      <EuiSpacer />
      <QueryDataGridMemo
        rowCount={queryObject.datarows.length}
        queryColumns={columns}
        visibleColumns={visibleColumns}
        setVisibleColumns={setVisibleColumns}
        dataValues={data}
      />
    </div>
  );
};

const OutputBody = ({
  typeOut,
  val,
  inp,
  visInput,
  setVisInput,
  DashboardContainerByValueRenderer,
}: {
  typeOut: string;
  val: string;
  inp: string;
  visInput: DashboardContainerInput;
  setVisInput: (input: DashboardContainerInput) => void;
  DashboardContainerByValueRenderer: DashboardStart['DashboardContainerByValueRenderer'];
}) => {
  /* Returns a component to render paragraph outputs using the para.typeOut property
   * Currently supports HTML, TABLE, IMG
   * TODO: add table rendering
   */
  const dateFormat = uiSettingsService.get('dateFormat');
  const from = convertDateTime(visInput?.timeRange?.from, true, false);
  const to = convertDateTime(visInput?.timeRange?.to, false, false);
  const displayFrom =
    convertDateTime(visInput?.timeRange?.from, true, dateFormat) || 'Invalid date';
  const displayTo = convertDateTime(visInput?.timeRange?.to, false, dateFormat) || 'Invalid date';
  if (typeOut !== undefined) {
    switch (typeOut) {
      case 'QUERY':
        return <QueryPara inp={inp} val={val} />;
      case 'MARKDOWN':
        return (
          <EuiText className="wrapAll markdown-output-text">
            <MarkdownRender source={val} />
          </EuiText>
        );
      case 'VISUALIZATION':
        return (
          <>
            <EuiText size="s" style={{ marginLeft: 9 }}>
              {`${displayFrom} - ${displayTo}`}
            </EuiText>
            <DashboardContainerByValueRenderer input={visInput} onInputUpdated={setVisInput} />
          </>
        );
      case 'OBSERVABILITY_VISUALIZATION':
        const http = getOSDHttp();
        const pplService = getPPLService();

        const onEditClick = (savedVisualizationId: string) => {
          window.location.assign(`observability-logs#/explorer/${savedVisualizationId}`);
        };
        return (
          <>
            <EuiText size="s" style={{ marginLeft: 9 }}>
              {`${displayFrom} - ${displayTo}`}
            </EuiText>
            <div style={{ height: '300px', width: '100%' }}>
              <VisualizationContainer
                http={http}
                editMode={false}
                visualizationId={''}
                onEditClick={onEditClick}
                savedVisualizationId={visInput.visSavedObjId}
                pplService={pplService}
                fromTime={from}
                toTime={to}
                onRefresh={false}
                pplFilterValue={''}
                usedInNotebooks={true}
                contextMenuId="notebook"
              />
            </div>
          </>
        );
      case 'HTML':
        return (
          <EuiText>
            {/* eslint-disable-next-line react/jsx-pascal-case */}
            <Media.HTML data={val} />
          </EuiText>
        );
      case 'TABLE':
        return <pre>{val}</pre>;
      case 'IMG':
        return <img alt="" src={'data:image/gif;base64,' + val} />;
      default:
        return <pre>{val}</pre>;
    }
  } else {
    console.log('output not supported', typeOut);
    return <pre />;
  }
};

/*
 * "ParaOutput" component is used by notebook to populate paragraph outputs for an open notebook.
 *
 * Props taken in as params are:
 * para - parsed paragraph from notebook
 *
 * Outputs component of nteract used as a container for notebook UI.
 * https://components.nteract.io/#outputs
 */
export const ParaOutput = (props: {
  http: CoreStart['http'];
  pplService: PPLService;
  para: ParaType;
  visInput: DashboardContainerInput;
  setVisInput: (input: DashboardContainerInput) => void;
  DashboardContainerByValueRenderer: DashboardStart['DashboardContainerByValueRenderer'];
}) => {
  const { para, DashboardContainerByValueRenderer, visInput, setVisInput } = props;

  return !para.isOutputHidden ? (
    <>
      {para.typeOut.map((typeOut: string, tIdx: number) => {
        return (
          <OutputBody
            key={para.uniqueId + '_paraOutputBody_' + tIdx}
            typeOut={typeOut}
            val={para.out[tIdx]}
            inp={para.inp}
            visInput={visInput}
            setVisInput={setVisInput}
            DashboardContainerByValueRenderer={DashboardContainerByValueRenderer}
          />
        );
      })}
    </>
  ) : null;
};
