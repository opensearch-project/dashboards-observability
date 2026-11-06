/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Toolbar of the Infrastructure tab, after the Explore metrics page's: a label filter, a
 * search box and a grid / rows layout. Active filters show as the APM pages' filter badges, with
 * "Clear all". Charts keep a fixed order (curated ones first), so there is no A-Z / prefix grouping.
 */

import React, { useState } from 'react';
import {
  EuiButtonEmpty,
  EuiButtonGroup,
  EuiComboBox,
  EuiFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiPopover,
  EuiSpacer,
  EuiSuperSelect,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { escapePromQLLabel } from '../../query_services/query_requests/escape_utils';
import { ActiveFilterBadges } from '../../shared/components/active_filter_badges';
import { INFRA_LABEL_OPERATORS } from '../../common/infra_constants';
import {
  InfraFilterableLabel,
  InfraLabelFilter,
  InfraLabelOperator,
  InfraLayout,
} from '../../common/types/infra_types';

const t = (id: string, defaultMessage: string) =>
  i18n.translate(`observability.apm.serviceInfrastructure.toolbar.${id}`, { defaultMessage });

const isRegexOperator = (op: InfraLabelOperator) => op === '=~' || op === '!~';

const matcher = (f: InfraLabelFilter) =>
  `${f.name}${f.operator}"${
    isRegexOperator(f.operator)
      ? f.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
      : escapePromQLLabel(f.value)
  }"`;

/**
 * Adds the filters' matchers to every series selector of a PromQL query. The infra queries
 * write each selector as `metric{label="..."...}` or `{__name__=~"..."...}`, so a selector is
 * a `{` followed by a label matcher.
 */
export function applyLabelFilters(query: string, filters: InfraLabelFilter[]): string {
  if (filters.length === 0) return query;
  const matchers = filters.map(matcher).join(',');
  return query.replace(/\{(?=[A-Za-z_][A-Za-z0-9_]*(?:=~|!~|!=|=)")/g, `{${matchers},`);
}

/** True when `value` is a valid (RE2-compatible enough) regex for a `=~` / `!~` filter. */
export function isValidFilterRegex(value: string): boolean {
  try {
    // PromQL regexes are fully anchored.

    new RegExp(`^(?:${value})$`);
    return true;
  } catch {
    return false;
  }
}

/** Client-side check of one value against a filter (for the pod table). */
export function matchesLabelFilter(value: string | undefined, f: InfraLabelFilter): boolean {
  const v = value ?? '';
  switch (f.operator) {
    case '=':
      return v === f.value;
    case '!=':
      return v !== f.value;
    case '=~':
    case '!~': {
      // Invalid regexes are rejected when the filter is added (isValidFilterRegex); one that got
      // through anyway doesn't filter the table.
      if (!isValidFilterRegex(f.value)) return true;
      const matches = new RegExp(`^(?:${f.value})$`).test(v);
      return f.operator === '=~' ? matches : !matches;
    }
  }
}

const OPERATOR_LABEL: Record<InfraLabelOperator, string> = {
  '=': t('opEquals', 'Equals'),
  '!=': t('opNotEqual', 'Not equal'),
  '=~': t('opRegex', 'Matches regex'),
  '!~': t('opNotRegex', 'Does not match regex'),
};

const OPERATOR_OPTIONS = INFRA_LABEL_OPERATORS.map((value) => ({
  value,
  inputDisplay: value,
  dropdownDisplay: (
    <>
      <strong>{value}</strong>
      <br />
      <small>{OPERATOR_LABEL[value]}</small>
    </>
  ),
}));

const LabelFilterPopover: React.FC<{
  labels: InfraFilterableLabel[];
  onAdd: (filter: InfraLabelFilter) => void;
}> = ({ labels, onAdd }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [operator, setOperator] = useState<InfraLabelOperator>('=');
  const [invalid, setInvalid] = useState(false);
  const close = () => {
    setIsOpen(false);
    setName('');
    setOperator('=');
    setInvalid(false);
  };
  /** False when the value is rejected, so the combo box keeps the typed text to fix. */
  const add = (value: string): boolean => {
    if (!name || !value) return false;
    // A bad regex would be sent with every chart query and fail each one: reject it here.
    if (isRegexOperator(operator) && !isValidFilterRegex(value)) {
      setInvalid(true);
      return false;
    }
    onAdd({ name, operator, value });
    close();
    return true;
  };
  const values = labels.find((l) => l.name === name)?.values ?? [];

  return (
    <EuiPopover
      isOpen={isOpen}
      closePopover={close}
      anchorPosition="downLeft"
      panelPaddingSize="s"
      button={
        <EuiButtonEmpty
          size="s"
          iconType="filter"
          onClick={() => setIsOpen((v) => !v)}
          data-test-subj="serviceInfrastructureAddLabelFilter"
        >
          {t('label', 'Label')}
        </EuiButtonEmpty>
      }
    >
      <EuiFlexGroup gutterSize="s" direction="column" style={{ width: 260 }}>
        <EuiFlexItem>
          <EuiFormRow label={t('labelName', 'Label')} display="rowCompressed">
            <EuiComboBox
              placeholder={t('selectLabel', 'Select label...')}
              singleSelection={{ asPlainText: true }}
              options={labels.map((l) => ({ label: l.name }))}
              selectedOptions={name ? [{ label: name }] : []}
              onChange={(sel) => setName(sel[0]?.label ?? '')}
              isClearable
              compressed
              data-test-subj="serviceInfrastructureFilterLabel"
            />
          </EuiFormRow>
        </EuiFlexItem>
        {name && (
          <EuiFlexItem>
            <EuiFormRow label={t('operator', 'Operator')} display="rowCompressed">
              <EuiSuperSelect
                options={OPERATOR_OPTIONS}
                valueOfSelected={operator}
                onChange={(v) => {
                  setOperator(v as InfraLabelOperator);
                  setInvalid(false);
                }}
                compressed
                data-test-subj="serviceInfrastructureFilterOperator"
              />
            </EuiFormRow>
          </EuiFlexItem>
        )}
        {name && (
          <EuiFlexItem>
            <EuiFormRow
              label={t('value', 'Value')}
              display="rowCompressed"
              isInvalid={invalid}
              error={invalid ? t('invalidRegex', 'Not a valid regular expression') : undefined}
            >
              <EuiComboBox
                placeholder={`${name}${operator}...`}
                singleSelection={{ asPlainText: true }}
                options={values.map((v) => ({ label: v }))}
                onChange={(sel) => sel[0] && add(sel[0].label)}
                onCreateOption={(v) => add(v.trim())}
                onSearchChange={(v) => v && setInvalid(false)}
                isInvalid={invalid}
                compressed
                data-test-subj="serviceInfrastructureFilterValue"
              />
            </EuiFormRow>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
    </EuiPopover>
  );
};

export interface InfraToolbarProps {
  labels: InfraFilterableLabel[];
  filters: InfraLabelFilter[];
  onFiltersChange: (filters: InfraLabelFilter[]) => void;
  search: string;
  onSearchChange: (search: string) => void;
  layout: InfraLayout;
  onLayoutChange: (layout: InfraLayout) => void;
}

export const InfraToolbar: React.FC<InfraToolbarProps> = (props) => (
  <>
    <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
      <EuiFlexItem grow={false}>
        <LabelFilterPopover
          labels={props.labels}
          onAdd={(f) => props.onFiltersChange([...props.filters, f])}
        />
      </EuiFlexItem>
      <EuiFlexItem>
        <EuiFieldSearch
          placeholder={t('search', 'Search metrics...')}
          value={props.search}
          onChange={(e) => props.onSearchChange(e.target.value)}
          isClearable
          fullWidth
          compressed
          aria-label={t('searchAria', 'Search metrics')}
          data-test-subj="serviceInfrastructureSearch"
        />
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiButtonGroup
          legend={t('layout', 'Layout')}
          options={[
            { id: 'grid', label: t('grid', 'Grid') },
            { id: 'rows', label: t('rows', 'Rows') },
          ]}
          idSelected={props.layout}
          onChange={(id) => props.onLayoutChange(id as InfraLayout)}
          buttonSize="compressed"
        />
      </EuiFlexItem>
    </EuiFlexGroup>
    {props.filters.length > 0 && (
      <>
        <EuiSpacer size="xs" />
        <ActiveFilterBadges
          filters={props.filters.map((f, i) => ({
            key: `infraLabel-${i}`,
            category: f.name,
            values: [f.operator === '=' ? f.value : `${f.operator} ${f.value}`],
            onRemove: () => props.onFiltersChange(props.filters.filter((_, j) => j !== i)),
          }))}
          onClearAll={() => props.onFiltersChange([])}
        />
      </>
    )}
  </>
);
