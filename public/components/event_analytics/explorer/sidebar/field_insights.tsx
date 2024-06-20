/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState, useEffect } from 'react';
import indexOf from 'lodash/indexOf';
import last from 'lodash/last';
import { EuiFlexGroup, EuiFlexItem, EuiLink, EuiBasicTable } from '@elastic/eui';
import { getIndexPatternFromRawQuery } from '../../../common/query_utils';
import { coreRefs } from '../../../../framework/core_refs';

interface IInsightsReq {
  id: string;
  name: string;
  format: string;
  query: string;
}

type IInsightsReqParams = Pick<IInsightsReq, 'format' | 'query'>;

export const FieldInsights = ({ field, query }: any) => {
  const { pplService } = coreRefs;
  const { rawQuery } = query;
  const index = getIndexPatternFromRawQuery(rawQuery);
  const generalReports = [
    {
      id: 'top_values',
      name: 'Top values',
      query: `source = ${index} | top 5 ${field.name} | sort - ${field.name}`,
      format: 'jdbc',
    },
    {
      id: 'rare_values',
      name: 'Rare values',
      query: `source = ${index} | rare ${field.name} | sort + ${field.name}`,
      format: 'jdbc',
    },
  ];

  const numericalOnlyReports = [
    {
      id: 'average',
      name: 'Average overtime',
      query: `source = ${index} | stats avg(${field.name})`,
      format: 'jdbc',
    },
    {
      id: 'maximum',
      name: 'Maximum overtime',
      query: `source = ${index} | stats max(${field.name})`,
      format: 'jdbc',
    },
    {
      id: 'minimum',
      name: 'Minimum overtime',
      query: `source = ${index} | stats min(${field.name})`,
      format: 'jdbc',
    },
  ];
  const NUMERICAL_TYPES = ['short', 'integer', 'long', 'float', 'double'];
  const isNumericalField = indexOf(NUMERICAL_TYPES, field.type) > 0;
  const [curReport, setCurReport] = useState({ ...generalReports[0] });
  const [reportContent, setReportContent] = useState({});

  const statsInsightsQueries = [
    {
      id: 'stats',
      name: 'Stats',
      query: `source = ${index} | stats avg(${field.name}), max(${field.name}), min(${field.name})`,
      format: 'jdbc',
    },
  ];

  const fetchData = async (requests: IInsightsReq[]) => {
    return await Promise.all(
      requests.map((reqQuery: IInsightsReq) => {
        const req = {
          format: reqQuery.format,
          query: reqQuery.query,
        };
        return getInsights(req);
      })
    );
  };

  useEffect(() => {
    let requests = [...generalReports];
    if (isNumericalField) requests = [...requests, ...statsInsightsQueries];
    fetchData(requests)
      .then((res) => {
        // numerical field
        generalReports.map((report, idx) => {
          if (!res[idx]?.jsonData) return;
          setReportContent((staleState) => {
            return {
              ...staleState,
              [report.id]: res[idx]?.jsonData || {},
            };
          });
        });
        if (res.length > 2) {
          const statsRes = last(res);
          if (!statsRes?.metadata) return;
          numericalOnlyReports.map((rep, idx) => {
            const fieldName = statsRes.metadata?.fields[idx]?.name;
            setReportContent((staleState) => {
              return {
                ...staleState,
                [rep.id]: [{ [field.name]: statsRes.data[fieldName][0] }],
              };
            });
          });
        }
      })
      .catch((error) => {
        console.error(error);
      });
  }, [query]);

  const getInsights = async (insightParams: IInsightsReqParams) => {
    try {
      return await pplService?.fetch(insightParams);
    } catch (error) {
      console.error(error);
    }
  };

  const insightsContent = useMemo(() => {
    const columns = [
      {
        field: field.name,
        name: field.name,
      },
    ];
    const repItems = reportContent[curReport.id] || [];

    return <EuiBasicTable columns={columns} items={repItems} />;
  }, [curReport, reportContent, field.name]);

  return (
    <EuiFlexGroup direction="column" data-test-subj="sidebarField__fieldInsights">
      <EuiFlexItem grow={false}>
        <EuiFlexGroup wrap>
          {generalReports.map((report) => {
            return (
              <EuiFlexItem grow={false}>
                <EuiLink onClick={() => setCurReport(report)}>{report.name}</EuiLink>
              </EuiFlexItem>
            );
          })}
          {indexOf(NUMERICAL_TYPES, field.type) > 0 &&
            numericalOnlyReports.map((report) => {
              return (
                <EuiFlexItem grow={false}>
                  <EuiLink onClick={() => setCurReport(report)}>{report.name}</EuiLink>
                </EuiFlexItem>
              );
            })}
        </EuiFlexGroup>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>{insightsContent}</EuiFlexItem>
    </EuiFlexGroup>
  );
};
