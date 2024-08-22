/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiCodeBlock, EuiSpacer, EuiText } from '@elastic/eui';
import MarkdownRender from '@nteract/markdown';
import { Media } from '@nteract/outputs';
import moment from 'moment';
import React from 'react';
import { CoreStart } from '../../../../../../../src/core/public';
import {
  DashboardContainerInput,
  DashboardStart,
} from '../../../../../../../src/plugins/dashboard/public';
import { ParaType } from '../../../../../common/types/notebooks';
import { getOSDHttp, getPPLService, uiSettingsService } from '../../../../../common/utils';
import { VisualizationContainer } from '../../../../components/custom_panels/panel_modules/visualization_container';
import PPLService from '../../../../services/requests/ppl';
import { QueryDataGridMemo } from './para_query_grid';

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

const OutputBody = ({
  key,
  typeOut,
  val,
  para,
  visInput,
  setVisInput,
  DashboardContainerByValueRenderer,
}: {
  key: string;
  typeOut: string;
  val: string;
  para: ParaType;
  visInput: DashboardContainerInput;
  setVisInput: (input: DashboardContainerInput) => void;
  DashboardContainerByValueRenderer: DashboardStart['DashboardContainerByValueRenderer'];
}) => {
  /* Returns a component to render paragraph outputs using the para.typeOut property
   * Currently supports HTML, TABLE, IMG
   * TODO: add table rendering
   */

  const dateFormat = uiSettingsService.get('dateFormat');

  if (typeOut !== undefined) {
    switch (typeOut) {
      case 'QUERY':
        const inputQuery = para.inp.substring(4, para.inp.length);
        const queryObject = JSON.parse(val);
        if (queryObject.hasOwnProperty('error')) {
          return <EuiCodeBlock key={key}>{val}</EuiCodeBlock>;
        } else {
          const columns = createQueryColumns(queryObject.schema);
          const data = getQueryOutputData(queryObject);
          return (
            <div>
              <EuiText key={'query-input-key'} className="wrapAll" data-test-subj="queryOutputText">
                <b>{inputQuery}</b>
              </EuiText>
              <EuiSpacer />
              <QueryDataGridMemo
                key={key}
                rowCount={queryObject.datarows.length}
                queryColumns={columns}
                dataValues={data}
              />
            </div>
          );
        }
      case 'MARKDOWN':
        return (
          <EuiText
            key={key}
            className="wrapAll markdown-output-text"
            data-test-subj="markdownOutputText"
            size="s"
          >
            <MarkdownRender source={val} />
          </EuiText>
        );
      case 'VISUALIZATION':
        let from = moment(visInput?.timeRange?.from).format(dateFormat);
        let to = moment(visInput?.timeRange?.to).format(dateFormat);
        from = from === 'Invalid date' ? visInput.timeRange.from : from;
        to = to === 'Invalid date' ? visInput.timeRange.to : to;
        return (
          <>
            <EuiText size="s" style={{ marginLeft: 9 }}>
              {`${from} - ${to}`}
            </EuiText>
            <DashboardContainerByValueRenderer
              key={key}
              input={visInput}
              onInputUpdated={setVisInput}
            />
          </>
        );
      case 'OBSERVABILITY_VISUALIZATION':
        let fromObs = moment(visInput?.timeRange?.from).format(dateFormat);
        let toObs = moment(visInput?.timeRange?.to).format(dateFormat);
        fromObs = fromObs === 'Invalid date' ? visInput.timeRange.from : fromObs;
        toObs = toObs === 'Invalid date' ? visInput.timeRange.to : toObs;
        const onEditClick = (savedVisualizationId: string) => {
          window.location.assign(`observability-logs#/explorer/${savedVisualizationId}`);
        };
        return (
          <>
            <EuiText size="s" style={{ marginLeft: 9 }}>
              {`${fromObs} - ${toObs}`}
            </EuiText>
            <div style={{ height: '300px', width: '100%' }}>
              <VisualizationContainer
                http={getOSDHttp()}
                editMode={false}
                visualizationId={''}
                onEditClick={onEditClick}
                savedVisualizationId={para.visSavedObjId}
                pplService={getPPLService()}
                fromTime={para.visStartTime}
                toTime={para.visEndTime}
                onRefresh={false}
                pplFilterValue={''}
                usedInNotebooks={true}
              />
            </div>
          </>
        );
      case 'HTML':
        return (
          <EuiText key={key}>
            {/* eslint-disable-next-line react/jsx-pascal-case */}
            <Media.HTML data={val} />
          </EuiText>
        );
      case 'TABLE':
        return <pre key={key}>{val}</pre>;
      case 'IMG':
        return <img alt="" src={'data:image/gif;base64,' + val} key={key} />;
      default:
        return <pre key={key}>{val}</pre>;
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

  return (
    !para.isOutputHidden && (
      <>
        {para.typeOut.map((typeOut: string, tIdx: number) => {
          return (
            <OutputBody
              key={para.uniqueId + '_paraOutputBody'}
              typeOut={typeOut}
              val={para.out[tIdx]}
              para={para}
              visInput={visInput}
              setVisInput={setVisInput}
              DashboardContainerByValueRenderer={DashboardContainerByValueRenderer}
            />
          );
        })}
      </>
    )
  );
};
