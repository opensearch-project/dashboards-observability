/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Toolbar of the Infrastructure tab, after the Explore metrics page's: a label filter, a
 * search box and a grid / rows layout. Charts keep a fixed order (curated ones first), so there
 * is no A-Z / prefix grouping.
 */

import React, { useState } from 'react';
import {
  EuiBadge,
  EuiButtonEmpty,
  EuiButtonGroup,
  EuiComboBox,
  EuiFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiPopover,
  EuiSuperSelect,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { escapePromQLLabel } from '../../query_services/query_requests/escape_utils';

const t = (id: string, defaultMessage: string) =>
  i18n.translate(`observability.apm.serviceInfrastructure.toolbar.${id}`, { defaultMessage });

export type LabelOperator = '=' | '!=' | '=~' | '!~';

export interface LabelFilter {
  /** Prometheus label name, e.g. `k8s_pod_name` or `resource_k8s_pod_name`. */
  name: string;
  operator: LabelOperator;
  value: string;
}

export type InfraLayout = 'grid' | 'rows';

/** A label the user can filter on, with the values seen for this service. */
export interface FilterableLabel {
  name: string;
  values: string[];
}

const matcher = (f: LabelFilter) =>
  `${f.name}${f.operator}"${
    f.operator === '=' || f.operator === '!='
      ? escapePromQLLabel(f.value)
      : f.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  }"`;

/**
 * Adds the filters' matchers to every series selector of a PromQL query. The infra queries
 * write each selector as `metric{label="..."...}` or `{__name__=~"..."...}`, so a selector is
 * a `{` followed by a label matcher.
 */
export function applyLabelFilters(query: string, filters: LabelFilter[]): string {
  if (filters.length === 0) return query;
  const matchers = filters.map(matcher).join(',');
  return query.replace(/\{(?=[A-Za-z_][A-Za-z0-9_]*(?:=~|!~|!=|=)")/g, `{${matchers},`);
}

/** Client-side check of one value against a filter (for the pod table). */
export function matchesLabelFilter(value: string | undefined, f: LabelFilter): boolean {
  const v = value ?? '';
  switch (f.operator) {
    case '=':
      return v === f.value;
    case '!=':
      return v !== f.value;
    case '=~':
    case '!~': {
      let re: RegExp;
      try {
        // PromQL regexes are fully anchored.
        re = new RegExp(`^(?:${f.value})$`);
      } catch {
        return true;
      }
      return f.operator === '=~' ? re.test(v) : !re.test(v);
    }
  }
}

const OPERATORS: Array<{
  value: LabelOperator;
  inputDisplay: string;
  dropdownDisplay: React.ReactNode;
}> = (
  [
    ['=', t('opEquals', 'Equals')],
    ['!=', t('opNotEqual', 'Not equal')],
    ['=~', t('opRegex', 'Matches regex')],
    ['!~', t('opNotRegex', 'Does not match regex')],
  ] as Array<[LabelOperator, string]>
).map(([value, label]) => ({
  value,
  inputDisplay: value,
  dropdownDisplay: (
    <>
      <strong>{value}</strong>
      <br />
      <small>{label}</small>
    </>
  ),
}));

const LabelFilterPopover: React.FC<{
  labels: FilterableLabel[];
  onAdd: (filter: LabelFilter) => void;
}> = ({ labels, onAdd }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [operator, setOperator] = useState<LabelOperator>('=');
  const close = () => {
    setIsOpen(false);
    setName('');
    setOperator('=');
  };
  const add = (value: string) => {
    if (!name || !value) return;
    onAdd({ name, operator, value });
    close();
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
                options={OPERATORS}
                valueOfSelected={operator}
                onChange={(v) => setOperator(v as LabelOperator)}
                compressed
              />
            </EuiFormRow>
          </EuiFlexItem>
        )}
        {name && (
          <EuiFlexItem>
            <EuiFormRow label={t('value', 'Value')} display="rowCompressed">
              <EuiComboBox
                placeholder={`${name}${operator}...`}
                singleSelection={{ asPlainText: true }}
                options={values.map((v) => ({ label: v }))}
                onChange={(sel) => sel[0] && add(sel[0].label)}
                onCreateOption={(v) => add(v.trim())}
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
  labels: FilterableLabel[];
  filters: LabelFilter[];
  onFiltersChange: (filters: LabelFilter[]) => void;
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
      <EuiFlexGroup
        gutterSize="xs"
        alignItems="center"
        wrap
        responsive={false}
        style={{ marginTop: 4 }}
        data-test-subj="serviceInfrastructureFilterBadges"
      >
        {props.filters.map((f, i) => (
          <EuiFlexItem grow={false} key={`${f.name}${f.operator}${f.value}${i}`}>
            <EuiBadge
              color="hollow"
              iconType="cross"
              iconSide="right"
              iconOnClick={() => props.onFiltersChange(props.filters.filter((_, j) => j !== i))}
              iconOnClickAriaLabel={`Remove ${f.name}${f.operator}${f.value}`}
            >
              {f.name}
              {f.operator}&quot;{f.value}&quot;
            </EuiBadge>
          </EuiFlexItem>
        ))}
      </EuiFlexGroup>
    )}
  </>
);
