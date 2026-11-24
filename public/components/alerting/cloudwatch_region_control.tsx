/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * The "Regions" section of the Datasource facet's CloudWatch group: one checkbox per region the
 * source offers, the regions every checked CloudWatch account is read in. Rendered only inside
 * that group, only when the source offers more than one region. At least one region stays
 * selected.
 *
 * Rows are labelled with the region code; the home region (the source's default region) reads
 * "<code> · This region" and comes first, then the checked regions, then the rest. The first
 * `initialVisible` rows show, with a "+N more" toggle.
 */
import React, { useMemo, useState } from 'react';
import { EuiCheckbox, EuiFlexGroup, EuiFlexItem, EuiLink, EuiText } from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { FormattedMessage } from '@osd/i18n/react';
export interface CloudWatchRegionControlProps {
  /** The regions the source offers. */
  regions: Array<{ id: string; name: string }>;
  /** The selected region ids. */
  selected: string[];
  onChange: (regions: string[]) => void;
  /** The home region, listed first and marked "This region". */
  defaultRegion?: string;
  /** Items per region id, shown on the right of each row when given. */
  counts?: Record<string, number>;
  /** Rows shown before the "+N more" toggle. */
  initialVisible: number;
}
/** A `data-test-subj` for a region row: letters, digits, `-`. */
export function cloudWatchRegionTestSubj(regionId: string): string {
  return `cloudWatchRegion-${regionId.replace(/[^A-Za-z0-9-]/g, '-')}`;
}
export const CloudWatchRegionControl: React.FC<CloudWatchRegionControlProps> = ({
  regions,
  selected,
  onChange,
  defaultRegion,
  counts,
  initialVisible,
}) => {
  const [expanded, setExpanded] = useState(false);
  const ordered = useMemo(() => {
    const home = regions.filter((r) => r.id === defaultRegion);
    const rest = regions.filter((r) => r.id !== defaultRegion);
    return [
      ...home,
      ...rest.filter((r) => selected.includes(r.id)),
      ...rest.filter((r) => !selected.includes(r.id)),
    ];
  }, [regions, selected, defaultRegion]);
  if (regions.length <= 1) return null;
  const hasOverflow = ordered.length > initialVisible;
  const shown = hasOverflow && !expanded ? ordered.slice(0, initialVisible) : ordered;
  const toggle = (id: string) => {
    if (selected.includes(id)) {
      // Unchecking the last region would leave the checked accounts with no region to read.
      if (selected.length <= 1) return;
      onChange(selected.filter((r) => r !== id));
    } else {
      onChange([...selected, id]);
    }
  };
  return (
    <div data-test-subj="cloudWatchRegionControl">
      <EuiText size="xs" color="subdued" style={{ marginTop: 2, marginBottom: 2 }}>
        <span>
          {i18n.translate('observability.alerting.cloudwatch.regionControl.label', {
            defaultMessage: 'Regions',
          })}
        </span>
      </EuiText>
      <div
        role="group"
        aria-label={i18n.translate('observability.alerting.cloudwatch.regionControl.ariaLabel', {
          defaultMessage: 'CloudWatch regions to read alarms from',
        })}
        style={{ paddingLeft: 8 }}
      >
        {shown.map((r) => {
          const label =
            r.id === defaultRegion
              ? i18n.translate('observability.alerting.cloudwatch.regionControl.homeRegion', {
                  defaultMessage: '{region} · This region',
                  values: { region: r.id },
                })
              : r.id;
          return (
            <div key={r.id} className="altFacetCheckboxRow">
              <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
                <EuiFlexItem grow={true} style={{ minWidth: 0 }}>
                  <EuiCheckbox
                    id={`datasource-cwRegion-${r.id}`}
                    data-test-subj={cloudWatchRegionTestSubj(r.id)}
                    label={
                      <span
                        title={r.name}
                        style={{ fontSize: 12, lineHeight: '18px', overflowWrap: 'anywhere' }}
                      >
                        {label}
                      </span>
                    }
                    checked={selected.includes(r.id)}
                    onChange={() => toggle(r.id)}
                    compressed
                  />
                </EuiFlexItem>
                {counts && (
                  <EuiFlexItem grow={false}>
                    <EuiText size="xs" color="subdued" className="altFacetCount">
                      ({counts[r.id] ?? 0})
                    </EuiText>
                  </EuiFlexItem>
                )}
              </EuiFlexGroup>
            </div>
          );
        })}
        {hasOverflow && (
          <EuiLink
            onClick={() => setExpanded((v) => !v)}
            color="primary"
            data-test-subj="cloudWatchRegionControl-showMore"
            style={{ marginTop: 4 }}
          >
            <EuiText size="xs">
              {expanded ? (
                <FormattedMessage
                  id="observability.alerting.facetFilterPanel.showLess"
                  defaultMessage="Show less"
                />
              ) : (
                <FormattedMessage
                  id="observability.alerting.facetFilterPanel.showMore"
                  defaultMessage="+{count} more"
                  values={{ count: ordered.length - initialVisible }}
                />
              )}
            </EuiText>
          </EuiLink>
        )}
      </div>
    </div>
  );
};
