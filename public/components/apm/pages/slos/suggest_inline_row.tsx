/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Inline suggestion row — a compact, single-line-ish layout used inside the
 * service tree table's expanded-row area. Keeps the row dense on a 19-
 * services × N-drafts page: checkbox · name · kind · rules · covered badge ·
 * inline owner/tier/target/p95 override fields. The long `reason` blurb and
 * rule-match details move into tooltips so the row stays compact.
 */

import React from 'react';
import {
  EuiBadge,
  EuiCheckbox,
  EuiFieldNumber,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiIconTip,
  EuiLoadingSpinner,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import type { Suggestion } from './suggest_engine';
import { suggestionIconType } from './suggest_icon';
import type { RowStatus } from './suggest_use_batch_create';

export interface OverrideValues {
  ownerTeam?: string;
  tier?: string;
  target?: string;
  latencyThreshold?: string;
}

export type OverridePatch = Partial<{
  ownerTeam: string;
  tier: string;
  target: string;
  latencyThreshold: string;
}>;

export interface SuggestionInlineRowProps {
  suggestion: Suggestion;
  selected: boolean;
  onToggle: () => void;
  overrides: OverrideValues;
  onOverrideChange: (patch: OverridePatch) => void;
  /** Render status — used by the batch-create progress strip. */
  rowStatus?: RowStatus;
  rowStatusMessage?: string;
}

export const SuggestionInlineRow: React.FC<SuggestionInlineRowProps> = ({
  suggestion,
  selected,
  onToggle,
  overrides,
  onOverrideChange,
  rowStatus,
  rowStatusMessage,
}) => {
  const spec = suggestion.input.spec;
  const objective = spec.objectives[0];
  const isLatency = objective?.latencyThreshold !== undefined;
  const unit =
    spec.sli.type === 'single' &&
    spec.sli.definition.backend === 'prometheus' &&
    spec.sli.definition.type === 'latency_threshold'
      ? spec.sli.definition.latencyThresholdUnit ?? 'seconds'
      : 'seconds';
  const isCovered = Boolean(suggestion.existingRuleMatch);
  const fadedOut = isCovered && !selected;
  const disableCheckbox = rowStatus === 'creating' || rowStatus === 'success';

  const coveredTooltip = suggestion.existingRuleMatch
    ? i18n.translate('observability.apm.slo.suggest.inlineRow.coveredTooltip', {
        defaultMessage:
          'Matched: {groupName} / {ruleName}{sloSuffix}. Unchecked to avoid dual-writing.',
        values: {
          groupName: suggestion.existingRuleMatch.groupName,
          ruleName: suggestion.existingRuleMatch.ruleName,
          sloSuffix: suggestion.existingRuleMatch.sloId
            ? i18n.translate('observability.apm.slo.suggest.inlineRow.coveredSloSuffix', {
                defaultMessage: ' (SLO {sloId})',
                values: { sloId: suggestion.existingRuleMatch.sloId },
              })
            : '',
        },
      })
    : '';

  return (
    <EuiPanel
      color={selected ? 'primary' : 'plain'}
      paddingSize="s"
      hasBorder
      style={{
        marginBottom: 8,
        opacity: fadedOut ? 0.75 : 1,
      }}
      data-test-subj={`slosSuggestInlineRow-${suggestion.key}`}
    >
      <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false} wrap>
        <EuiFlexItem grow={false}>
          {rowStatus === 'creating' ? (
            <EuiLoadingSpinner
              size="m"
              data-test-subj={`slosSuggestRowStatus-${suggestion.key}-creating`}
            />
          ) : rowStatus === 'success' ? (
            <EuiIcon
              type="check"
              color="success"
              data-test-subj={`slosSuggestRowStatus-${suggestion.key}-success`}
            />
          ) : rowStatus === 'error' ? (
            <EuiIconTip
              type="alert"
              color="danger"
              content={
                rowStatusMessage ??
                i18n.translate('observability.apm.slo.suggest.inlineRow.createFailedFallback', {
                  defaultMessage: 'Create failed.',
                })
              }
              data-test-subj={`slosSuggestRowStatus-${suggestion.key}-error`}
            />
          ) : (
            <EuiCheckbox
              id={`slosSuggestSelect-${suggestion.key}`}
              checked={selected}
              onChange={onToggle}
              disabled={disableCheckbox}
              data-test-subj={`slosSuggestSelect-${suggestion.key}`}
            />
          )}
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiIcon type={suggestionIconType(suggestion)} color="subdued" />
        </EuiFlexItem>
        <EuiFlexItem grow={true}>
          <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false} wrap>
            <EuiFlexItem grow={false}>
              <EuiToolTip content={suggestion.reason} position="top">
                <EuiText size="s">
                  <strong>{spec.name}</strong>
                </EuiText>
              </EuiToolTip>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiBadge color="hollow">{suggestion.kind}</EuiBadge>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiBadge color="hollow">
                {i18n.translate('observability.apm.slo.suggest.inlineRow.rulesBadge', {
                  defaultMessage: '{count} rules',
                  values: { count: suggestion.estimatedRuleCount },
                })}
              </EuiBadge>
            </EuiFlexItem>
            {isCovered && (
              <EuiFlexItem grow={false}>
                <EuiToolTip content={coveredTooltip} position="top">
                  <EuiBadge
                    color="warning"
                    iconType="check"
                    data-test-subj={`slosSuggestCovered-${suggestion.key}`}
                  >
                    {i18n.translate('observability.apm.slo.suggest.inlineRow.coveredBadge', {
                      defaultMessage: 'covered by existing rule',
                    })}
                  </EuiBadge>
                </EuiToolTip>
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="xs" />
      {/* Inline override strip — same field shapes as the card, just laid out
          in a single row instead of two. */}
      <EuiFlexGroup gutterSize="s" responsive={false} wrap>
        <EuiFlexItem style={{ minWidth: 160 }}>
          <EuiFieldText
            compressed
            prepend={i18n.translate('observability.apm.slo.suggest.inlineRow.ownerPrepend', {
              defaultMessage: 'Owner',
            })}
            value={overrides.ownerTeam ?? spec.owner.teams[0] ?? ''}
            onChange={(e) => onOverrideChange({ ownerTeam: e.target.value })}
            placeholder={i18n.translate(
              'observability.apm.slo.suggest.inlineRow.ownerPlaceholder',
              {
                defaultMessage: 'team',
              }
            )}
            aria-label={i18n.translate('observability.apm.slo.suggest.inlineRow.ownerAriaLabel', {
              defaultMessage: 'Owner team',
            })}
          />
        </EuiFlexItem>
        <EuiFlexItem style={{ minWidth: 120 }}>
          <EuiFieldText
            compressed
            prepend={i18n.translate('observability.apm.slo.suggest.inlineRow.tierPrepend', {
              defaultMessage: 'Tier',
            })}
            value={overrides.tier ?? spec.tier ?? ''}
            onChange={(e) => onOverrideChange({ tier: e.target.value })}
            placeholder="tier-1"
            aria-label={i18n.translate('observability.apm.slo.suggest.inlineRow.tierAriaLabel', {
              defaultMessage: 'Tier',
            })}
          />
        </EuiFlexItem>
        <EuiFlexItem style={{ minWidth: 120 }}>
          <EuiFieldNumber
            compressed
            prepend={i18n.translate('observability.apm.slo.suggest.inlineRow.targetPrepend', {
              defaultMessage: 'Target',
            })}
            append="%"
            value={
              overrides.target ??
              (objective ? (objective.target * 100).toFixed(2).replace(/\.?0+$/, '') : '99')
            }
            onChange={(e) => onOverrideChange({ target: e.target.value })}
            min={50}
            max={99.999}
            step={0.01}
            aria-label={i18n.translate('observability.apm.slo.suggest.inlineRow.targetAriaLabel', {
              defaultMessage: 'Target percentage',
            })}
          />
        </EuiFlexItem>
        {isLatency && (
          <EuiFlexItem style={{ minWidth: 120 }}>
            <EuiFieldNumber
              compressed
              prepend="p95 ≤"
              append={unit === 'milliseconds' ? 'ms' : 's'}
              value={overrides.latencyThreshold ?? String(objective.latencyThreshold)}
              onChange={(e) => onOverrideChange({ latencyThreshold: e.target.value })}
              min={0}
              step={unit === 'milliseconds' ? 10 : 0.01}
              aria-label={i18n.translate(
                'observability.apm.slo.suggest.inlineRow.latencyAriaLabel',
                { defaultMessage: 'Latency threshold' }
              )}
            />
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
    </EuiPanel>
  );
};
