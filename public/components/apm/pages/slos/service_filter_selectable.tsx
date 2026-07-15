/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared presentational body for the two service-picker popovers (Suggest SLOs
 * page filter + Services Home suggest CTA). Owns the option list, the searchable
 * EuiSelectable, and the "covered" append badge; callers own the popover
 * trigger, the footer buttons, and what committing a selection does (URL scope
 * vs. navigate). Keeping this here means both pickers agree on look, ordering,
 * covered-disabling, and the covered-exclusion guard in one place.
 */

import React, { useMemo } from 'react';
import { EuiSelectable, EuiText } from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { buildServiceFilterOptions } from './service_filter_options';
import './service_filter_selectable.scss';

/** Fixed pixel height of the service list inside the popover. */
export const SERVICE_FILTER_LIST_HEIGHT = 240;

const t = {
  searchPlaceholder: i18n.translate('observability.apm.slo.serviceFilter.searchPlaceholder', {
    defaultMessage: 'Filter services',
  }),
  ariaLabel: i18n.translate('observability.apm.slo.serviceFilter.ariaLabel', {
    defaultMessage: 'Select services to suggest SLOs for',
  }),
  covered: i18n.translate('observability.apm.slo.serviceFilter.covered', {
    defaultMessage: 'covered',
  }),
};

export interface ServiceFilterSelectableProps {
  /** Every service the picker can offer (already de-duped by the caller). */
  serviceNames: string[];
  /** Services currently selected/scoped — rendered checked and floated to top. */
  selectedSet: Set<string>;
  /** Services whose canonical pair already exists — rendered disabled. */
  coveredSet: Set<string>;
  /**
   * Called with the next selection (covered services already excluded) whenever
   * the user toggles a row. Callers decide what a selection commits to.
   */
  onSelectionChange: (labels: string[]) => void;
}

export const ServiceFilterSelectable: React.FC<ServiceFilterSelectableProps> = ({
  serviceNames,
  selectedSet,
  coveredSet,
  onSelectionChange,
}) => {
  const options = useMemo(
    () =>
      buildServiceFilterOptions(serviceNames, selectedSet, coveredSet).map((opt) => ({
        label: opt.label,
        checked: opt.checked,
        disabled: opt.disabled,
        append: opt.covered ? (
          <EuiText size="xs" color="success">
            {t.covered}
          </EuiText>
        ) : undefined,
      })),
    [serviceNames, selectedSet, coveredSet]
  );

  const onChange = (newOptions: Array<{ label: string; checked?: 'on' }>) => {
    // Guard against a covered label ever reaching the selection — covered rows
    // render disabled, but keep the filter so callers never get a covered svc.
    const sel = newOptions
      .filter((o) => o.checked === 'on' && !coveredSet.has(o.label))
      .map((o) => o.label);
    onSelectionChange(sel);
  };

  return (
    <EuiSelectable
      aria-label={t.ariaLabel}
      searchable
      searchProps={{
        compressed: true,
        placeholder: t.searchPlaceholder,
        'aria-label': t.ariaLabel,
      }}
      options={options}
      onChange={onChange}
      listProps={{ bordered: false }}
      height={SERVICE_FILTER_LIST_HEIGHT}
    >
      {(list, search) => (
        <>
          <div className="service-filter__search">{search}</div>
          {list}
        </>
      )}
    </EuiSelectable>
  );
};
