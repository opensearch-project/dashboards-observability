/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Look-back window editor for PPL (logs) alerting rules, rendered inside the
 * Query card. Mirrors the alerting-dashboards-plugin PPL monitor "look back
 * window" control: a toggle plus an amount + unit.
 *
 * The window is anchored on the query toolbar's Time field — there is no
 * separate timestamp picker, so the query and its look-back filter can never
 * disagree on which field is "time". The window is applied at save time by
 * injecting a `where <timeField> > DATE_SUB(NOW(), INTERVAL n UNIT)` clause
 * into the query (see `ppl_lookback.ts`).
 */
import React, { useEffect, useMemo, useRef } from 'react';
import {
  EuiCallOut,
  EuiCheckbox,
  EuiFieldNumber,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiIconTip,
  EuiSelect,
  EuiSpacer,
  htmlIdGenerator,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import {
  computeLookBackMinutes,
  hasUserTimeFilter,
  LOOKBACK_WINDOW_MAX_MINUTES,
} from '../../../../../common/services/alerting/ppl_lookback';
import { LOOKBACK_UNIT_OPTIONS, PplLookBackUnit } from '../create_monitor_types';
import { useIndexMappings } from '../../hooks/use_index_mappings';

// Mapping types the alerting backend treats as timestamps for the window.
const DATE_FIELD_TYPES = ['date', 'date_nanos'];

export interface PplLookbackEditorProps {
  dsId: string;
  indices: string[];
  useLookBackWindow: boolean;
  lookBackAmount: number;
  lookBackUnit: PplLookBackUnit;
  /** The query's Time field (toolbar) — the look-back window filters on it. */
  timeField: string;
  /** The user's PPL query — checked for time filters of its own on the Time field. */
  query: string;
  onUpdate: (patch: {
    useLookBackWindow?: boolean;
    lookBackAmount?: number;
    lookBackUnit?: PplLookBackUnit;
    timeField?: string;
  }) => void;
}

const idGen = htmlIdGenerator('pplLookback');

/** "1 hour", "30 minutes", "2 days". */
function describeWindow(amount: number, unit: PplLookBackUnit): string {
  const n = Number(amount) > 0 ? Number(amount) : 1;
  return `${n} ${n === 1 ? unit.replace(/s$/, '') : unit}`;
}

/** Prefer the conventional `@timestamp`, else the first detected date field (non-empty list). */
function pickDefaultTimeField(dateFields: string[]): string {
  return dateFields.includes('@timestamp') ? '@timestamp' : dateFields[0];
}

export const PplLookbackEditor: React.FC<PplLookbackEditorProps> = ({
  dsId,
  indices,
  useLookBackWindow,
  lookBackAmount,
  lookBackUnit,
  timeField,
  query,
  onUpdate,
}) => {
  const { fieldsByType, isStale } = useIndexMappings({ dsId, indices });

  const dateFields = useMemo(() => {
    const set = new Set<string>();
    for (const type of DATE_FIELD_TYPES) {
      for (const f of fieldsByType[type] || []) set.add(f);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [fieldsByType]);

  // Enabled once the query has a time field, or one can be picked for it.
  const canEnable = !!timeField || dateFields.length > 0;

  // Only act on field lists that belong to the current index selection — right
  // after the indices change, `fieldsByType` is still the previous selection's.
  const mappingsReady = indices.length > 0 && !isStale;
  const selectionKey = `${dsId}::${[...indices].sort().join(',')}`;
  // Selection whose Time field is settled (picked by us, the user, or a seed),
  // and the field we picked automatically (so we only ever replace our own).
  const settledForRef = useRef<string | null>(null);
  const autoPickedRef = useRef<string | null>(null);

  // The window defaults ON. When no Time field is chosen for a new index
  // selection, pick one so default-on actually filters — once per selection,
  // never again after the user clears it, and replacing only a field we picked
  // ourselves when the new indices don't have it.
  useEffect(() => {
    if (!useLookBackWindow || !mappingsReady) return;
    const pick = () => {
      const next = pickDefaultTimeField(dateFields);
      autoPickedRef.current = next;
      settledForRef.current = selectionKey;
      onUpdate({ timeField: next });
    };
    if (timeField) {
      const ourStalePick =
        timeField === autoPickedRef.current &&
        dateFields.length > 0 &&
        !dateFields.includes(timeField);
      if (ourStalePick) pick();
      else settledForRef.current = selectionKey;
      return;
    }
    if (settledForRef.current === selectionKey || dateFields.length === 0) return;
    pick();
  }, [useLookBackWindow, mappingsReady, selectionKey, timeField, dateFields, onUpdate]);

  // The chosen Time field isn't a date field in the selected indices (typed by
  // hand, or kept from a previous selection): the filter would fail or never
  // match, so say so rather than silently guessing a different field.
  const timeFieldNotDate =
    useLookBackWindow && mappingsReady && !!timeField && !dateFields.includes(timeField);

  // The user's query already constrains the Time field; both filters apply.
  const overlapsUserFilter =
    useLookBackWindow && !!timeField && hasUserTimeFilter(query, timeField);

  const lookBackMinutes = computeLookBackMinutes({
    useLookBackWindow,
    lookBackAmount,
    lookBackUnit,
  });
  // A cleared amount is stored as 0 and flagged here ("at least 1 minute").
  const tooSmall = useLookBackWindow && lookBackMinutes < 1;
  const tooLarge = useLookBackWindow && lookBackMinutes > LOOKBACK_WINDOW_MAX_MINUTES;
  const boundsError = tooSmall
    ? i18n.translate('observability.alerting.pplLookback.tooSmallError', {
        defaultMessage: 'Must be at least 1 minute',
      })
    : tooLarge
      ? i18n.translate('observability.alerting.pplLookback.tooLargeError', {
          defaultMessage: 'Must be at most 7 days (10,080 minutes)',
        })
      : undefined;

  const onToggle = (checked: boolean) => {
    if (checked) {
      const patch: Parameters<typeof onUpdate>[0] = { useLookBackWindow: true };
      if (!(lookBackAmount > 0)) patch.lookBackAmount = 1;
      if (!timeField && mappingsReady && dateFields.length > 0) {
        const picked = pickDefaultTimeField(dateFields);
        autoPickedRef.current = picked;
        settledForRef.current = selectionKey;
        patch.timeField = picked;
      }
      onUpdate(patch);
    } else {
      onUpdate({ useLookBackWindow: false });
    }
  };

  // Help text is rendered in the DOM (not only in the tooltip) so the reason
  // the control is disabled reaches keyboard/screen-reader users — a disabled
  // checkbox is not focusable (WCAG 3.3.2 / 4.1.2).
  const helpText = timeFieldNotDate
    ? i18n.translate('observability.alerting.pplLookback.timeFieldNotDateHelp', {
        defaultMessage:
          '{field} is not a date field in the selected indices, so the look back filter may fail or never match. Pick a date Time field above.',
        values: { field: timeField },
      })
    : !canEnable
      ? i18n.translate('observability.alerting.pplLookback.noTimeFieldHelp', {
          defaultMessage:
            'Select indices with a date field to enable the look back window. It filters on the Time field above.',
        })
      : timeField
        ? i18n.translate('observability.alerting.pplLookback.helpTextWithField', {
            defaultMessage:
              'When enabled, each run only evaluates data where {field} falls within the window. The filter is added to your PPL query and can be edited there after saving.',
            values: { field: timeField },
          })
        : i18n.translate('observability.alerting.pplLookback.helpText', {
            defaultMessage:
              'When enabled, each run only evaluates recent data, filtered on the Time field above.',
          });

  return (
    <>
      <EuiFormRow fullWidth helpText={helpText} isInvalid={timeFieldNotDate}>
        <EuiCheckbox
          id={idGen('use')}
          data-test-subj="alertManagerPplUseLookBack"
          disabled={!canEnable}
          label={
            <span>
              {i18n.translate('observability.alerting.pplLookback.toggleLabel', {
                defaultMessage: 'Add look back window',
              })}{' '}
              <EuiIconTip
                type="iInCircle"
                content={i18n.translate('observability.alerting.pplLookback.toggleTooltip', {
                  defaultMessage:
                    'Specifies how far back in time the rule queries data on each run.',
                })}
              />
            </span>
          }
          checked={useLookBackWindow && canEnable}
          onChange={(e) => onToggle(e.target.checked)}
        />
      </EuiFormRow>

      {useLookBackWindow && canEnable && (
        <>
          <EuiSpacer size="s" />
          {/* Amount + Unit stay inline as a compact duration pair at every
              width. Amount is the sole child of its EuiFormRow so EUI wires the
              bounds-error id into aria-describedby (WCAG 3.3.1). */}
          <EuiFlexGroup responsive={false} gutterSize="s">
            <EuiFlexItem grow={false} style={{ minWidth: 120 }}>
              <EuiFormRow
                label={i18n.translate('observability.alerting.pplLookback.windowLabel', {
                  defaultMessage: 'Look back window',
                })}
                display="rowCompressed"
                isInvalid={!!boundsError}
                error={boundsError}
              >
                <EuiFieldNumber
                  data-test-subj="alertManagerPplLookBackAmount"
                  value={lookBackAmount}
                  min={1}
                  isInvalid={!!boundsError}
                  onChange={(e) =>
                    onUpdate({
                      lookBackAmount: Math.floor(Number(e.target.value)) || 0,
                    })
                  }
                  compressed
                  aria-label={i18n.translate('observability.alerting.pplLookback.amountAriaLabel', {
                    defaultMessage: 'Look back window amount',
                  })}
                />
              </EuiFormRow>
            </EuiFlexItem>
            <EuiFlexItem grow={false} style={{ minWidth: 120 }}>
              <EuiFormRow
                label={i18n.translate('observability.alerting.pplLookback.unitLabel', {
                  defaultMessage: 'Unit',
                })}
                display="rowCompressed"
              >
                <EuiSelect
                  data-test-subj="alertManagerPplLookBackUnit"
                  options={LOOKBACK_UNIT_OPTIONS}
                  value={lookBackUnit}
                  onChange={(e) => onUpdate({ lookBackUnit: e.target.value as PplLookBackUnit })}
                  compressed
                  aria-label={i18n.translate('observability.alerting.pplLookback.unitAriaLabel', {
                    defaultMessage: 'Look back window unit',
                  })}
                />
              </EuiFormRow>
            </EuiFlexItem>
          </EuiFlexGroup>
          {overlapsUserFilter && (
            <>
              <EuiSpacer size="s" />
              <EuiCallOut
                size="s"
                color="warning"
                iconType="clock"
                data-test-subj="alertManagerPplLookBackOverlapCallout"
                title={i18n.translate('observability.alerting.pplLookback.overlapTitle', {
                  defaultMessage: 'Your query already filters on {field}',
                  values: { field: timeField },
                })}
              >
                {i18n.translate('observability.alerting.pplLookback.overlapBody', {
                  defaultMessage:
                    'The look back window is added as another filter, so rows must match both your time filter and the last {window}. If they do not overlap (for example a fixed past range), the rule never fires. Turn off the look back window to rely on your own filter.',
                  values: { window: describeWindow(lookBackAmount, lookBackUnit) },
                })}
              </EuiCallOut>
            </>
          )}
        </>
      )}
    </>
  );
};
