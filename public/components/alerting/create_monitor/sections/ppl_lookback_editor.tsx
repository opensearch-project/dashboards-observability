/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Look-back window editor for PPL (logs) alerting rules. Mirrors the
 * alerting-dashboards-plugin PPL monitor "look back window" control: a toggle,
 * an amount + unit, and the timestamp field the sliding filter anchors on.
 *
 * The window is applied at save time by injecting a `where <field> > DATE_SUB(
 * NOW(), INTERVAL n UNIT)` clause into the query (see `ppl_lookback.ts`); this
 * component only collects the inputs and surfaces the 1-minute..7-day bound.
 */
import React, { useCallback, useEffect, useMemo } from 'react';
import {
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
  lookbackTimestampField: string;
  /** The form's general time field — used as the default lookback anchor. */
  timeField: string;
  onUpdate: (patch: {
    useLookBackWindow?: boolean;
    lookBackAmount?: number;
    lookBackUnit?: PplLookBackUnit;
    lookbackTimestampField?: string;
  }) => void;
}

const idGen = htmlIdGenerator('pplLookback');

export const PplLookbackEditor: React.FC<PplLookbackEditorProps> = ({
  dsId,
  indices,
  useLookBackWindow,
  lookBackAmount,
  lookBackUnit,
  lookbackTimestampField,
  timeField,
  onUpdate,
}) => {
  const { fieldsByType } = useIndexMappings({ dsId, indices });

  // Detected date fields across the picked indices, de-duplicated and sorted.
  const dateFields = useMemo(() => {
    const set = new Set<string>();
    for (const type of DATE_FIELD_TYPES) {
      for (const f of fieldsByType[type] || []) set.add(f);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [fieldsByType]);

  // Option list always includes the selected field and the form's time field,
  // even when the mapping fetch hasn't returned them (or failed), so an edited
  // rule never shows a blank/duplicated select.
  const timestampOptions = useMemo(() => {
    const values = new Set<string>(dateFields);
    if (timeField) values.add(timeField);
    if (lookbackTimestampField) values.add(lookbackTimestampField);
    return Array.from(values)
      .sort((a, b) => a.localeCompare(b))
      .map((value) => ({ value, text: value }));
  }, [dateFields, timeField, lookbackTimestampField]);

  const hasCandidateField = timestampOptions.length > 0;

  const defaultTimestampField = useCallback((): string => {
    if (timeField && timestampOptions.some((o) => o.value === timeField)) return timeField;
    return timestampOptions[0]?.value || '';
  }, [timeField, timestampOptions]);

  // The window defaults ON, but the anchor field can't be seeded until the
  // index mappings resolve. Without this, a user who picks an index (or arrives
  // from Explore) but never touches the toolbar time field would see the box
  // checked with a BLANK timestamp — and on save nothing is injected, silently
  // dropping the "only evaluate recent data" protection the UI claims is on.
  // Seed the first detected date field as soon as one is available so default-on
  // actually works; the user can still change it.
  useEffect(() => {
    if (useLookBackWindow && hasCandidateField && !lookbackTimestampField) {
      onUpdate({ lookbackTimestampField: defaultTimestampField() });
    }
  }, [
    useLookBackWindow,
    hasCandidateField,
    lookbackTimestampField,
    defaultTimestampField,
    onUpdate,
  ]);

  const lookBackMinutes = computeLookBackMinutes({
    useLookBackWindow,
    lookBackAmount,
    lookBackUnit,
  });
  const amountEmpty = lookBackAmount === undefined || (lookBackAmount as unknown) === '';
  const tooSmall = useLookBackWindow && !amountEmpty && lookBackMinutes < 1;
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
      // Seed a sensible window + default the anchor field so the control isn't
      // blank the moment it's enabled.
      if (!lookBackAmount || lookBackAmount <= 0) patch.lookBackAmount = 1;
      if (!lookBackUnit) patch.lookBackUnit = 'hours';
      if (!lookbackTimestampField) patch.lookbackTimestampField = defaultTimestampField();
      onUpdate(patch);
    } else {
      onUpdate({ useLookBackWindow: false });
    }
  };

  return (
    <>
      <EuiFormRow
        fullWidth
        // Help text is rendered in the DOM (not only in the tooltip) so the
        // reason the control is disabled reaches keyboard/screen-reader users —
        // a disabled checkbox is not focusable, so a hover-only tooltip would be
        // unreachable for them (WCAG 3.3.2 / 4.1.2).
        helpText={
          hasCandidateField
            ? i18n.translate('observability.alerting.pplLookback.helpText', {
                defaultMessage:
                  'When enabled, a time filter is added to your PPL query so each run only evaluates recent data. You can edit that filter in the query after saving.',
              })
            : i18n.translate('observability.alerting.pplLookback.noDateFieldHelp', {
                defaultMessage:
                  'No date field detected on the selected indices. Pick a time field or an index with a date field to enable the look back window.',
              })
        }
      >
        <EuiCheckbox
          id={idGen('use')}
          data-test-subj="alertManagerPplUseLookBack"
          disabled={!hasCandidateField}
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
          checked={useLookBackWindow && hasCandidateField}
          onChange={(e) => onToggle(e.target.checked)}
        />
      </EuiFormRow>

      {useLookBackWindow && hasCandidateField && (
        <>
          <EuiSpacer size="s" />
          <EuiFlexGroup gutterSize="s">
            {/* Amount + Unit stay inline as a compact duration pair at every
                width (inner responsive={false}); only the Timestamp field drops
                to its own row when the flyout narrows — consistent with the
                throttle "value + unit" control. Amount is the sole child of its
                EuiFormRow so EUI wires the bounds-error id into aria-describedby
                — a screen reader hears the reason, not just "invalid" (WCAG 3.3.1). */}
            <EuiFlexItem grow={false}>
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
                      value={amountEmpty ? '' : lookBackAmount}
                      min={1}
                      isInvalid={!!boundsError}
                      onChange={(e) =>
                        onUpdate({
                          lookBackAmount:
                            e.target.value === '' ? 0 : parseInt(e.target.value, 10) || 0,
                        })
                      }
                      compressed
                      aria-label={i18n.translate(
                        'observability.alerting.pplLookback.amountAriaLabel',
                        {
                          defaultMessage: 'Look back window amount',
                        }
                      )}
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
                      onChange={(e) =>
                        onUpdate({ lookBackUnit: e.target.value as PplLookBackUnit })
                      }
                      compressed
                      aria-label={i18n.translate(
                        'observability.alerting.pplLookback.unitAriaLabel',
                        {
                          defaultMessage: 'Look back window unit',
                        }
                      )}
                    />
                  </EuiFormRow>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiFormRow
                label={i18n.translate('observability.alerting.pplLookback.timestampFieldLabel', {
                  defaultMessage: 'Timestamp field',
                })}
                display="rowCompressed"
              >
                <EuiSelect
                  data-test-subj="alertManagerPplLookBackTimestampField"
                  options={timestampOptions}
                  hasNoInitialSelection={!lookbackTimestampField}
                  value={lookbackTimestampField || ''}
                  onChange={(e) => onUpdate({ lookbackTimestampField: e.target.value })}
                  compressed
                  aria-label={i18n.translate(
                    'observability.alerting.pplLookback.timestampFieldAriaLabel',
                    { defaultMessage: 'Look back window timestamp field' }
                  )}
                />
              </EuiFormRow>
            </EuiFlexItem>
          </EuiFlexGroup>
        </>
      )}
    </>
  );
};
