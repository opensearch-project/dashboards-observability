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
} from '../../../../../../plugin';
import {
  ASSC_OBJ_TABLE_ACC_COLUMN_NAME,
  ASSC_OBJ_TABLE_SEARCH_HINT,
  ASSC_OBJ_TABLE_SUBJ,
} from '../utils/associated_objects_tab_utils';
import { getAccelerationName } from '../../accelerations/utils/acceleration_utils';

interface AssociatedObjectsTableProps {
  datasourceName: string;
  associatedObjects: AssociatedObject[];
  cachedAccelerations: CachedAcceleration[];
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
  const { datasourceName, associatedObjects, cachedAccelerations } = props;
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
              renderAssociatedObjectsDetailsFlyout(item);
            } else {
              const acceleration = cachedAccelerations.find(
                (acc) => getAccelerationName(acc.indexName, acc, datasourceName) === name
              );
              console.log(acceleration);
              renderAccelerationDetailsFlyout({
                indexName: getAccelerationName(
                  acceleration?.indexName,
                  acceleration,
                  datasourceName
                ),
                acceleration,
                dataSourceName: datasourceName,
              });
            }
          }}
        >
          {name}
        </EuiLink>
      ),
    },
    {
      field: 'database',
      name: i18n.translate('datasources.associatedObjectsTab.column.database', {
        defaultMessage: 'Database',
      }),
      sortable: true,
    },
    {
      field: 'type',
      name: i18n.translate('datasources.associatedObjectsTab.column.type', {
        defaultMessage: 'Type',
      }),
      sortable: true,
    },
    {
      field: 'accelerations',
      name: i18n.translate('datasources.associatedObjectsTab.column.accelerations', {
        defaultMessage: 'Accelerations',
      }),
      sortable: true,
      render: (accelerations: string[]) => {
        return accelerations.length > 0
          ? accelerations.map((acceleration, index) => (
              <React.Fragment key={index}>
                <EuiLink onClick={() => renderAccelerationDetailsFlyout(acceleration)}>
                  {acceleration.name}
                </EuiLink>
                {index < accelerations.length - 1 ? ', ' : ''}
              </React.Fragment>
            ))
          : '-';
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
              defaultMessage: 'Discover this object',
            }
          ),
          type: 'icon',
          icon: 'discoverApp',
          onClick: (item: AssociatedObject) => console.log('Discover', item),
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
          available: (item: AssociatedObject) => item.type === 'Table',
          onClick: (item: AssociatedObject) => console.log('Accelerate', item),
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
        } else if (
          clause.field === ASSC_OBJ_TABLE_ACC_COLUMN_NAME &&
          Array.isArray(associatedObject.accelerations)
        ) {
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

  return (
    <EuiInMemoryTable
      items={filteredObjects}
      columns={columns}
      search={tableSearch}
      pagination={pagination}
      sorting={sorting}
      data-test-subj={ASSC_OBJ_TABLE_SUBJ}
    />
  );
};
