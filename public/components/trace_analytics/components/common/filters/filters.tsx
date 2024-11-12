/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiBadge,
  EuiButtonEmpty,
  EuiContextMenu,
  EuiContextMenuPanelDescriptor,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiPopover,
  EuiPopoverTitle,
  EuiSpacer,
  EuiTextColor,
} from '@elastic/eui';
import React, { useMemo, useState } from 'react';
import { TraceAnalyticsMode } from '../../../../../../common/types/trace_analytics';
import { FilterEditPopover } from './filter_edit_popover';
import { getFilterFields, getValidFilterFields } from './filter_helpers';

export interface FilterType {
  field: string;
  operator: string;
  value: any;
  inverted: boolean;
  disabled: boolean;
  custom?: any;
  locked?: boolean;
}

export interface FiltersProps {
  filters: FilterType[];
  appConfigs?: FilterType[];
  setFilters: (filters: FilterType[]) => void;
  mode: TraceAnalyticsMode;
  attributesFilterFields: string[];
}

interface FiltersOwnProps extends FiltersProps {
  page: 'dashboard' | 'traces' | 'services' | 'app';
}

export function Filters(props: FiltersOwnProps) {
  // set a filter at an index. if newFilter doesn't exist, remove filter at the index
  // if index doesn't exist, append newFilter to the end
  const setFilter = (newFilter: FilterType, index: number) => {
    const newFilters = [...props.filters];
    if (newFilter) newFilters.splice(index, 1, newFilter);
    else newFilters.splice(index, 1);
    props.setFilters(newFilters);
  };

  const validFilterFields = useMemo(
    () => getValidFilterFields(props.mode, props.page, props.attributesFilterFields),
    [props.page, props.mode, props.attributesFilterFields]
  );
  const filterFieldOptions = useMemo(
    () =>
      getFilterFields(props.mode, props.page, props.attributesFilterFields).map((field) => ({
        label: field,
      })),
    [props.page, props.mode, props.attributesFilterFields]
  );

  const getFilterPopoverPanels = (
    filter: FilterType,
    index: number,
    closePopover: () => void
  ): EuiContextMenuPanelDescriptor[] => [
    {
      id: 0,
      items: [
        {
          name: 'Edit filter',
          icon: <EuiIcon type="invert" size="m" />,
          disabled: !!filter.custom?.query || validFilterFields.indexOf(filter.field) === -1,
          panel: 1,
        },
        {
          name: `${filter.inverted ? 'Include' : 'Exclude'} results`,
          icon: <EuiIcon type={filter.inverted ? 'plusInCircle' : 'minusInCircle'} size="m" />,
          disabled: !!filter.custom?.query || validFilterFields.indexOf(filter.field) === -1,
          onClick: () => {
            filter.inverted = !filter.inverted;
            setFilter(filter, index);
          },
        },
        {
          name: filter.disabled ? 'Re-enable' : 'Temporarily disable',
          icon: <EuiIcon type={filter.disabled ? 'eye' : 'eyeClosed'} size="m" />,
          disabled: validFilterFields.indexOf(filter.field) === -1,
          onClick: () => {
            filter.disabled = !filter.disabled;
            setFilter(filter, index);
          },
        },
        {
          name: 'Delete',
          icon: <EuiIcon data-test-subj="deleteFilterIcon" type="trash" size="m" />,
          onClick: () => setFilter(null, index),
        },
      ],
    },
    {
      id: 1,
      width: 530,
      title: 'Edit filter',
      content: (
        <div style={{ margin: 15 }}>
          <FilterEditPopover
            filterFieldOptions={filterFieldOptions}
            filter={filter}
            index={index}
            setFilter={setFilter}
            closePopover={closePopover}
          />
        </div>
      ),
    },
  ];

  const AddFilterButton = () => {
    const [isPopoverOpen, setIsPopoverOpen] = useState(false);
    const button = (
      <EuiButtonEmpty
        size="s"
        flush="left"
        iconType="plusInCircle"
        onClick={() => {
          setIsPopoverOpen(true);
        }}
      >
        Add filter
      </EuiButtonEmpty>
    );

    return (
      <EuiPopover
        button={button}
        isOpen={isPopoverOpen}
        closePopover={() => setIsPopoverOpen(false)}
        anchorPosition="downLeft"
        data-test-subj="addfilter"
      >
        <EuiPopoverTitle>{'Add filter'}</EuiPopoverTitle>
        <FilterEditPopover
          filterFieldOptions={filterFieldOptions}
          index={props.filters.length}
          setFilter={setFilter}
          closePopover={() => setIsPopoverOpen(false)}
        />
      </EuiPopover>
    );
  };

  const renderFilters = () => {
    const FilterBadge = ({ filter, index }: { filter: FilterType; index: number }) => {
      const [isPopoverOpen, setIsPopoverOpen] = useState(false);
      const disabled = filter.locked || filter.disabled;
      const className =
        'globalFilterItem' +
        (disabled ? ' globalFilterItem-isDisabled' : '') +
        (filter.inverted ? ' globalFilterItem-isExcluded' : '');
      const value =
        typeof filter.value === 'string'
          ? filter.value
          : Array.isArray(filter.value) // combo box
          ? filter.value[0].label
          : `${filter.value.from} to ${filter.value.to}`; // range selector
      const filterLabel = filter.inverted ? (
        <>
          <EuiTextColor color={disabled ? 'default' : 'danger'}>{'NOT '}</EuiTextColor>
          <EuiTextColor color="default">{`${filter.field}: ${value}`}</EuiTextColor>
        </>
      ) : (
        `${filter.field}: ${value}`
      );

      const badge = (
        <EuiBadge
          className={className}
          onClick={() => setIsPopoverOpen(true)}
          onClickAriaLabel="Open filter settings"
          color={disabled ? '#e7e9f0' : 'hollow'}
          iconType="cross"
          iconSide="right"
          iconOnClick={() => {
            setFilter(null, index);
          }}
          iconOnClickAriaLabel="Remove filter"
          data-test-subj="filterBadge"
        >
          {filterLabel}
        </EuiBadge>
      );
      return (
        <EuiFlexItem grow={false} key={`filter-${index}`}>
          <EuiPopover
            data-test-subj={`${filter.value}FilterBadge`}
            isOpen={isPopoverOpen}
            closePopover={() => setIsPopoverOpen(false)}
            panelPaddingSize="none"
            button={badge}
          >
            <EuiContextMenu
              initialPanelId={0}
              panels={getFilterPopoverPanels(filter, index, () => setIsPopoverOpen(false))}
            />
          </EuiPopover>
        </EuiFlexItem>
      );
    };

    return (
      <>
        {props.filters.length > 0
          ? props.filters.map((filter, i) => <FilterBadge filter={filter} index={i} key={i} />)
          : null}
      </>
    );
  };

  const filterComponents = useMemo(() => renderFilters(), [props.filters]);

  return props.filters.length > 0 ? (
    <>
      <EuiSpacer size="s" />
      <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
        {filterComponents}
        <EuiFlexItem grow={false}>
          <AddFilterButton />
        </EuiFlexItem>
      </EuiFlexGroup>
    </>
  ) : null;
}

export const GlobalFilterButton = ({
  filters,
  setFilters,
  attributesFilterFields,
  mode,
  page,
}: {
  filters: FilterType[];
  setFilters: (filters: FilterType[]) => void;
  attributesFilterFields: string[];
  mode: TraceAnalyticsMode;
  page: 'dashboard' | 'traces' | 'services' | 'app';
}) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const filterFieldOptions = useMemo(
    () =>
      getFilterFields(mode, page, attributesFilterFields).map((field) => ({
        label: field,
        'data-test-subj': `filterFieldOptions-${field}`,
      })),
    [mode, page, attributesFilterFields]
  );

  const togglePopover = () => {
    setIsPopoverOpen(!isPopoverOpen);
  };

  const handleAddFilter = (newFilter: FilterType) => {
    const updatedFilters = [...filters, newFilter];
    setFilters(updatedFilters);
    togglePopover();
  };

  const globalPopoverPanels = [
    {
      id: 0,
      title: 'Change all filters',
      items: [
        {
          name: 'Add filter',
          icon: <EuiIcon type="plusInCircle" size="m" />,
          onClick: () => setIsPopoverOpen(true),
          panel: 1,
        },
        {
          name: 'Enable all',
          icon: <EuiIcon type="eye" size="m" />,
          onClick: () => {
            setFilters(
              filters.map((filter) => ({
                ...filter,
                disabled: filter.locked ? filter.disabled : false,
              }))
            );
            togglePopover();
          },
        },
        {
          name: 'Disable all',
          icon: <EuiIcon type="eyeClosed" size="m" />,
          onClick: () => {
            setFilters(
              filters.map((filter) => ({
                ...filter,
                disabled: filter.locked ? filter.disabled : true,
              }))
            );
            togglePopover();
          },
        },
        {
          name: 'Invert inclusion',
          icon: <EuiIcon type="invert" size="m" />,
          onClick: () => {
            setFilters(
              filters.map((filter) => ({
                ...filter,
                inverted: filter.locked
                  ? filter.inverted
                  : filter.custom?.query
                  ? false
                  : !filter.inverted,
              }))
            );
            togglePopover();
          },
        },
        {
          name: 'Invert enabled/disabled',
          icon: <EuiIcon type="eye" size="m" />,
          onClick: () => {
            setFilters(
              filters.map((filter) => ({
                ...filter,
                disabled: filter.locked ? filter.disabled : !filter.disabled,
              }))
            );
            togglePopover();
          },
        },
        {
          name: 'Remove all',
          icon: <EuiIcon type="trash" size="m" />,
          onClick: () => {
            setFilters([]);
            togglePopover();
          },
        },
      ],
    },
    {
      id: 1,
      title: 'Add filter',
      width: 530,
      content: (
        <div style={{ margin: 15 }}>
          <FilterEditPopover
            filterFieldOptions={filterFieldOptions}
            index={filters.length}
            setFilter={handleAddFilter}
            closePopover={() => setIsPopoverOpen(false)}
          />
        </div>
      ),
    },
  ];

  return (
    <EuiPopover
      isOpen={isPopoverOpen}
      closePopover={() => setIsPopoverOpen(false)}
      button={
        <EuiButtonEmpty size="s" iconType="filter" onClick={togglePopover}>
          <EuiIcon type="arrowDown" />
        </EuiButtonEmpty>
      }
      anchorPosition="downLeft"
      panelPaddingSize="none"
      data-test-subj="global-filter-button"
    >
      <EuiContextMenu initialPanelId={0} panels={globalPopoverPanels} size="s" />
    </EuiPopover>
  );
};
