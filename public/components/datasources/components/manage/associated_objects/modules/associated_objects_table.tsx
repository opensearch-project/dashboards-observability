/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import _ from 'lodash';
import {
  EuiInMemoryTable,
  EuiLink,
  SearchFilterConfig,
  EuiTableFieldDataColumnType,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import {
  AssociatedObject,
  CachedAcceleration,
} from '../../../../../../../common/types/data_connections';
import {
  getRenderAccelerationDetailsFlyout,
  getRenderAssociatedObjectsDetailsFlyout,
  getRenderCreateAccelerationFlyout,
} from '../../../../../../plugin';
import {
  ASSC_OBJ_TABLE_ACC_COLUMN_NAME,
  ASSC_OBJ_TABLE_SEARCH_HINT,
  ASSC_OBJ_TABLE_SUBJ,
  redirectToExplorerOSIdx,
  redirectToExplorerWithDataSrc,
} from '../utils/associated_objects_tab_utils';
import { getAccelerationName } from '../../accelerations/utils/acceleration_utils';
import {
  ACCELERATION_INDEX_TYPES,
  DATA_SOURCE_TYPES,
} from '../../../../../../../common/constants/data_sources';

interface AssociatedObjectsTableProps {
  datasourceName: string;
  associatedObjects: AssociatedObject[];
  cachedAccelerations: CachedAcceleration[];
  handleRefresh: () => void;
}

interface FilterOption {
  value: string;
  text: string;
}

interface AssociatedTableFilter {
  type: string;
  field: string;
  operator: string;
  value: string;
}

export const AssociatedObjectsTable = (props: AssociatedObjectsTableProps) => {
  const { datasourceName, associatedObjects, cachedAccelerations, handleRefresh } = props;
  const [accelerationFilterOptions, setAccelerationFilterOptions] = useState<FilterOption[]>([]);
  const [filteredObjects, setFilteredObjects] = useState<AssociatedObject[]>([]);

  const columns = [
    {
      field: 'name',
      name: i18n.translate('datasources.associatedObjectsTab.column.name', {
        defaultMessage: 'Name',
      }),
      sortable: true,
      'data-test-subj': 'nameCell',
      render: (name: string, item: AssociatedObject) => (
        <EuiLink
          onClick={() => {
            if (item.type === 'table') {
              renderAssociatedObjectsDetailsFlyout(item, datasourceName, handleRefresh);
            } else {
              const acceleration = cachedAccelerations.find((acc) => acc.indexName === item.id);
              if (acceleration) {
                renderAccelerationDetailsFlyout(acceleration, datasourceName);
              }
            }
          }}
        >
          {name}
        </EuiLink>
      ),
    },
    {
      field: 'type',
      name: i18n.translate('datasources.associatedObjectsTab.column.type', {
        defaultMessage: 'Type',
      }),
      sortable: true,
      render: (type) => {
        if (type === 'table') return 'Table';
        return ACCELERATION_INDEX_TYPES.find((accType) => type === accType.value)!.label;
      },
    },
    {
      field: 'accelerations',
      name: i18n.translate('datasources.associatedObjectsTab.column.accelerations', {
        defaultMessage: 'Associations',
      }),
      sortable: true,
      render: (accelerations: CachedAcceleration[] | AssociatedObject, obj: AssociatedObject) => {
        if (Array.isArray(accelerations)) {
          if (accelerations.length === 0) {
            return '-';
          } else if (accelerations.length === 1) {
            const name = getAccelerationName(accelerations[0]);
            return (
              <EuiLink
                onClick={() =>
                  renderAccelerationDetailsFlyout(accelerations[0], datasourceName, handleRefresh)
                }
              >
                {name}
              </EuiLink>
            );
          }
          return (
            <EuiLink
              onClick={() =>
                renderAssociatedObjectsDetailsFlyout(obj, datasourceName, handleRefresh)
              }
            >
              View all {accelerations.length}
            </EuiLink>
          );
        } else if (accelerations) {
          return (
            <EuiLink
              onClick={() =>
                renderAssociatedObjectsDetailsFlyout(accelerations, datasourceName, handleRefresh)
              }
            >
              {accelerations.name}
            </EuiLink>
          );
        }
      },
    },
    {
      name: i18n.translate('datasources.associatedObjectsTab.column.actions', {
        defaultMessage: 'Actions',
      }),
      actions: [
        {
          name: i18n.translate('datasources.associatedObjectsTab.action.discover.name', {
            defaultMessage: 'Discover',
          }),
          description: i18n.translate(
            'datasources.associatedObjectsTab.action.discover.description',
            {
              defaultMessage: 'Query in Observability Logs',
            }
          ),
          type: 'icon',
          icon: 'discoverApp',
          onClick: (asscObj: AssociatedObject) => {
            if (asscObj.type === 'covering' || asscObj.type === 'materialized') {
              // find the flint index name through the cached acceleration
              const acceleration = cachedAccelerations.find(
                (acc) => getAccelerationName(acc) === asscObj.name
              );
              redirectToExplorerOSIdx(acceleration!.flintIndexName);
            } else if (asscObj.type === 'table' || asscObj.type === 'skipping') {
              redirectToExplorerWithDataSrc(
                asscObj.datasource,
                DATA_SOURCE_TYPES.S3Glue,
                asscObj.database,
                asscObj.tableName
              );
            }
          },
        },
        {
          name: i18n.translate('datasources.associatedObjectsTab.action.accelerate.name', {
            defaultMessage: 'Accelerate',
          }),
          description: i18n.translate(
            'datasources.associatedObjectsTab.action.accelerate.description',
            {
              defaultMessage: 'Accelerate this object',
            }
          ),
          type: 'icon',
          icon: 'bolt',
          available: (item: AssociatedObject) => item.type === 'table',
          onClick: (item: AssociatedObject) =>
            renderCreateAccelerationFlyout(datasourceName, item.database, item.name, handleRefresh),
        },
      ],
    },
  ] as Array<EuiTableFieldDataColumnType<AssociatedObject>>;

  const onSearchChange = ({ query, error }) => {
    if (error) {
      console.log('Search error:', error);
      return;
    }

    const matchesClauses = (
      associatedObject: AssociatedObject,
      clauses: AssociatedTableFilter[]
    ): boolean => {
      if (clauses.length === 0) return true;

      return clauses.some((clause) => {
        if (clause.field !== ASSC_OBJ_TABLE_ACC_COLUMN_NAME) {
          return associatedObject[clause.field] === clause.value;
        } else if (clause.field === ASSC_OBJ_TABLE_ACC_COLUMN_NAME) {
          return associatedObject.type !== 'table' && associatedObject.name === clause.value;
        }

        return false;
      });
    };

    const filtered = associatedObjects.filter((obj) => {
      const clauses = query.ast._clauses;
      return matchesClauses(obj, clauses);
    });

    setFilteredObjects(filtered);
  };

  const searchFilters = [
    {
      type: 'field_value_selection',
      field: 'accelerations',
      name: 'Accelerations',
      multiSelect: true,
      options: accelerationFilterOptions,
      cache: 60000,
    },
  ] as SearchFilterConfig[];

  const tableSearch = {
    filters: searchFilters,
    box: {
      incremental: true,
      placeholder: ASSC_OBJ_TABLE_SEARCH_HINT,
      schema: {
        fields: { name: { type: 'string' }, database: { type: 'string' } },
      },
    },
    onChange: onSearchChange,
  };

  const pagination = {
    initialPageSize: 10,
    pageSizeOptions: [10, 25, 50],
  };

  const sorting = {
    sort: {
      field: 'name',
      direction: 'asc',
    },
  };

  useEffect(() => {
    const accelerationOptions = Array.from(
      new Set(
        associatedObjects
          .filter((obj) => obj.type !== 'table')
          .flatMap((obj) => obj.name)
          .filter(Boolean)
      )
    )
      .sort()
      .map((name) => ({ value: name, text: name }));
    setAccelerationFilterOptions(accelerationOptions);
    setFilteredObjects(associatedObjects);
  }, [associatedObjects]);

  const renderAccelerationDetailsFlyout = getRenderAccelerationDetailsFlyout();
  const renderAssociatedObjectsDetailsFlyout = getRenderAssociatedObjectsDetailsFlyout();
  const renderCreateAccelerationFlyout = getRenderCreateAccelerationFlyout();

  return (
    <EuiInMemoryTable
      items={filteredObjects}
      columns={columns}
      search={tableSearch}
      pagination={pagination}
      sorting={sorting}
      hasActions={true}
      tableLayout="auto"
      data-test-subj={ASSC_OBJ_TABLE_SUBJ}
    />
  );
};
