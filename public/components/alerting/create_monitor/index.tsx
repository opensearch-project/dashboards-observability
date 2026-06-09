/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Create Monitor — flyout workflow for creating either a Prometheus (PromQL)
 * or OpenSearch monitor. The user picks the target datasource first, which
 * determines the form variant shown.
 *
 * This file is the flyout shell — owns state, routes to either the Prometheus
 * or OpenSearch form section, and handles save/validation. Sub-files:
 *   - `create_monitor_types.ts`      — types, defaults, option arrays
 *   - `prometheus_form_section.tsx`  — PromQL-backed form body
 *   - `opensearch_form_section.tsx`  — OpenSearch monitor form body
 *
 * Re-exports `MonitorFormState` so existing consumers importing from
 * `'./create_monitor'` continue to work unchanged.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  EuiBadge,
  EuiButton,
  EuiButtonEmpty,
  EuiConfirmModal,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiFormRow,
  EuiOverlayMask,
  EuiPanel,
  EuiSpacer,
  EuiSwitch,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { Datasource } from '../../../../common/types/alerting';
import {
  MonitorFormState as ValidatorFormState,
  validateMonitorForm,
  validatePplForm,
} from '../../../../common/services/alerting/validators';
import { validatePromQL } from '../promql_editor';
import { MonitorTemplateWizard, AlertTemplate } from '../monitor_template_wizard';
import { MonitorBackendType } from '../monitor_form_components';
import {
  DEFAULT_OS_FORM,
  DEFAULT_PROM_FORM,
  MonitorFormState,
  OpenSearchFormState,
  PrometheusFormState,
} from './create_monitor_types';
import { PrometheusFormSection } from './prometheus_form_section';
import { OpenSearchFormSection } from './opensearch_form_section';

// Re-export the shared form-state type so existing consumers that import
// `MonitorFormState` from `'./create_monitor'` keep working unchanged.
export type { MonitorFormState } from './create_monitor_types';

// ============================================================================
// Main Component — Flyout
// ============================================================================

export interface CreateMonitorProps {
  /**
   * Persists the form. May be sync or async — when async, this component
   * awaits resolution and resets the in-flight `isSaving` state on either
   * branch (success or rejection), so a failed save (PPL parse error,
   * network blip, name-collision the server caught) re-enables the save
   * button instead of leaving it permanently disabled.
   */
  onSave: (monitor: MonitorFormState) => void | Promise<void>;
  /** Batch save for AI-generated monitors (does not close the flyout) */
  onBatchSave?: (monitors: MonitorFormState[]) => void;
  onCancel: () => void;
  /** All selectable datasources (including workspace-scoped Prometheus entries) */
  datasources: Datasource[];
  /** Pre-selected datasource IDs from the parent page */
  selectedDsIds?: string[];
  context?: { service?: string; team?: string };
  /**
   * `'create'` (default) opens an empty form; `'edit'` pre-populates the
   * form from `initialForm`. The "AI / from-template" mode is hidden in
   * edit mode — Prometheus rule-group templates only make sense at create
   * time.
   */
  mode?: 'create' | 'edit';
  /**
   * Pre-populated form state for edit mode. Producer is `EditMonitor`,
   * which converts a `UnifiedRule` via `unifiedRuleToOsForm`.
   */
  initialForm?: MonitorFormState;
  /**
   * Override the initial backend type. When provided, takes precedence over
   * the type derived from the parent-page datasource selection. Used by the
   * Rules tab "Logs" / "Metrics" popover entries to force the matching form
   * variant even if the user's selected datasource is the other type.
   */
  initialBackendType?: MonitorBackendType;
  /**
   * Predicate the form uses to surface an inline "name already in use"
   * error before submit. Receives the trimmed candidate name and the
   * datasource id the form is currently bound to. Returning `true` flags
   * the row as invalid. The OS alerting backend silently accepts duplicate
   * monitor names, so this guard is purely client-side; the page wires it
   * up against the loaded rules list (excluding `initialForm`'s own id in
   * edit mode so renaming back to the current name passes).
   */
  isNameTaken?: (trimmedName: string, dsId: string) => boolean;
  /**
   * Server-side error from the most recent save attempt, routed by the
   * parent to whichever form field it belongs under so the user sees it
   * inline in addition to the toast. Currently only `pplMessage` is wired
   * — set it from a `PPL Query validation failed: ...` 400 response and
   * the OpenSearch form section will render it under the PPL editor. The
   * error clears as soon as the user edits the query.
   */
  submitError?: { pplMessage?: string };
  /** Called when the user edits the PPL query, so the parent can clear `submitError.pplMessage`. */
  onClearPplSubmitError?: () => void;
  /**
   * Set when the flyout is launched from somewhere outside the alerting
   * app — currently only the Explore Logs page. Hides the
   * "Build query in logs →" link in the Query panel header (the user is
   * already there, so the link would be a circular round-trip that loses
   * unsaved form state).
   */
  hideBuildInLogsLink?: boolean;
}

type CreationMode = 'manual' | 'ai';

export const CreateMonitor: React.FC<CreateMonitorProps> = ({
  onSave,
  onBatchSave,
  onCancel,
  datasources,
  selectedDsIds,
  context,
  mode = 'create',
  initialForm,
  initialBackendType,
  isNameTaken,
  submitError,
  onClearPplSubmitError,
  hideBuildInLogsLink,
}) => {
  const isEdit = mode === 'edit';

  // Determine initial datasource from parent selection. When the caller
  // pinned a backend type (e.g. "Logs" popover -> opensearch), only adopt
  // the parent's datasource if it matches that type — otherwise fall back
  // to picking the first datasource of the requested type.
  const initialDs = useMemo(() => {
    if (selectedDsIds && selectedDsIds.length > 0) {
      const ds = datasources.find((d) => d.id === selectedDsIds[0]);
      if (ds && (!initialBackendType || ds.type === initialBackendType)) return ds;
    }
    if (initialBackendType) {
      const fallback = datasources.find((d) => d.type === initialBackendType);
      if (fallback) return fallback;
    }
    return null;
  }, [datasources, selectedDsIds, initialBackendType]);

  // In edit mode the backend type is pinned by the existing monitor; an
  // explicit `initialBackendType` (popover choice) wins next; otherwise it
  // follows the parent-page datasource selection.
  const initialType: MonitorBackendType = initialForm
    ? initialForm.datasourceType === 'prometheus'
      ? 'prometheus'
      : 'opensearch'
    : initialBackendType
    ? initialBackendType
    : initialDs?.type === 'opensearch'
    ? 'opensearch'
    : 'prometheus';

  const [creationMode, setCreationMode] = useState<CreationMode>('manual');
  const [backendType, setBackendType] = useState<MonitorBackendType>(initialType);
  const [promForm, setPromForm] = useState<PrometheusFormState>(
    initialForm && initialForm.datasourceType === 'prometheus'
      ? initialForm
      : {
          ...DEFAULT_PROM_FORM,
          datasourceId: initialType === 'prometheus' && initialDs ? initialDs.id : '',
        }
  );
  const [osForm, setOsForm] = useState<OpenSearchFormState>(
    initialForm && initialForm.datasourceType === 'opensearch'
      ? initialForm
      : {
          ...DEFAULT_OS_FORM,
          datasourceId: initialType === 'opensearch' && initialDs ? initialDs.id : '',
        }
  );
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  // Snapshot the initial form so we can detect "dirty" against the value the
  // user actually saw on open. Captured once via lazy initializer; never
  // updated — even if the form's identity-of-state mutates, dirty is always
  // measured against the original. JSON-stringify is fine for these small
  // forms.
  const [initialPromSnapshot] = useState(() =>
    JSON.stringify(
      initialForm && initialForm.datasourceType === 'prometheus'
        ? initialForm
        : {
            ...DEFAULT_PROM_FORM,
            datasourceId: initialType === 'prometheus' && initialDs ? initialDs.id : '',
          }
    )
  );
  const [initialOsSnapshot] = useState(() =>
    JSON.stringify(
      initialForm && initialForm.datasourceType === 'opensearch'
        ? initialForm
        : {
            ...DEFAULT_OS_FORM,
            datasourceId: initialType === 'opensearch' && initialDs ? initialDs.id : '',
          }
    )
  );
  // Compare only the active backend's form — switching backendType mid-edit
  // doesn't itself constitute dirtiness; only typed changes within whichever
  // form variant is currently rendered do.
  const isDirty =
    backendType === 'prometheus'
      ? JSON.stringify(promForm) !== initialPromSnapshot
      : JSON.stringify(osForm) !== initialOsSnapshot;
  // Single entry point for "user wants to abandon edits". Bare onCancel
  // discards immediately; the wrapped version asks first when dirty. Used
  // by the footer Cancel button, the flyout's overlay-click / Esc handler,
  // and any other affordance that closes the flyout without saving.
  const requestCancel = useCallback(() => {
    if (isDirty) {
      setShowDiscardConfirm(true);
      return;
    }
    onCancel();
  }, [isDirty, onCancel]);

  const updateProm = useCallback(
    <K extends keyof PrometheusFormState>(key: K, value: PrometheusFormState[K]) => {
      setPromForm((prev) => ({ ...prev, [key]: value }));
    },
    []
  );
  const updateOs = useCallback(
    <K extends keyof OpenSearchFormState>(key: K, value: OpenSearchFormState[K]) => {
      setOsForm((prev) => ({ ...prev, [key]: value }));
      // Clear the inline PPL submit error as soon as the user edits the
      // query — keeping a stale error visible after the offending text has
      // been changed is misleading. Other field edits don't dismiss it.
      if (key === 'query' && onClearPplSubmitError) onClearPplSubmitError();
    },
    [onClearPplSubmitError]
  );

  const handleDatasourceChange = (id: string, type: MonitorBackendType) => {
    setBackendType(type);
    // Reset to manual if switching away from Prometheus
    if (type !== 'prometheus' && creationMode === 'ai') {
      setCreationMode('manual');
    }
    if (type === 'prometheus') {
      setPromForm((prev) => ({ ...prev, datasourceId: id }));
    } else {
      setOsForm((prev) => ({ ...prev, datasourceId: id }));
    }
  };

  // Shared fields
  const activeForm = backendType === 'prometheus' ? promForm : osForm;
  const updateName = (name: string) => {
    if (backendType === 'prometheus') updateProm('name', name);
    else updateOs('name', name);
  };
  const updateEnabled = (enabled: boolean) => {
    if (backendType === 'prometheus') updateProm('enabled', enabled);
    else updateOs('enabled', enabled);
  };

  // Validation
  const queryErrors = backendType === 'prometheus' ? validatePromQL(promForm.query) : [];
  const hasQueryErrors = queryErrors.some((e) => e.severity === 'error');
  // Live duplicate-name check (BUG-1). The OS alerting backend silently
  // accepts duplicates, so we have to guard client-side. Skip when the field
  // is empty (the "required" error handles that case) or when the parent
  // page didn't supply a checker.
  const trimmedName = activeForm.name.trim();
  const dsForCheck = activeForm.datasourceId;
  const duplicateName = !!(
    isNameTaken &&
    trimmedName !== '' &&
    dsForCheck !== '' &&
    isNameTaken(trimmedName, dsForCheck)
  );
  const duplicateNameError = duplicateName
    ? i18n.translate('observability.alerting.createMonitor.nameDuplicate', {
        defaultMessage: 'A rule with this name already exists on the selected datasource.',
      })
    : undefined;
  const isValid =
    trimmedName !== '' &&
    activeForm.datasourceId !== '' &&
    !duplicateName &&
    (backendType === 'prometheus'
      ? promForm.query.trim() !== '' && !hasQueryErrors
      : osForm.query.trim() !== '');

  const handleSave = useCallback(async () => {
    setHasSubmitted(true);
    if (isSaving) return;
    // Guard against duplicate names client-side. The Save button is also
    // disabled via `isValid`, but defending here too means programmatic
    // submission paths (Enter key on a field) can't bypass the check.
    if (duplicateName) return;

    let formToSave: MonitorFormState | null = null;
    if (backendType === 'prometheus') {
      const result = validateMonitorForm(promForm as ValidatorFormState);
      if (!result.valid) {
        setValidationErrors(result.errors);
        return;
      }
      formToSave = promForm;
    } else {
      const result = validatePplForm({
        name: osForm.name,
        query: osForm.query,
        pplTriggers: osForm.pplTriggers,
      });
      if (!result.valid) {
        setValidationErrors(result.errors);
        return;
      }
      formToSave = osForm;
    }
    setValidationErrors({});
    setIsSaving(true);
    // `Promise.resolve` adapts both sync and async `onSave` callers. The
    // try/catch ensures `isSaving` resets regardless of outcome — the
    // parent's own try/catch (in `alarms_page.handleCreateMonitor` /
    // `handleEditMonitor`) is what surfaces the error to the user via
    // toast + inline PPL error; rethrowing here would just become an
    // unhandled rejection at the React-event boundary.
    try {
      await Promise.resolve(onSave(formToSave));
    } catch {
      // Intentionally swallowed — see comment above.
    } finally {
      setIsSaving(false);
    }
  }, [backendType, promForm, osForm, onSave, duplicateName, isSaving]);

  // When AI wizard is active and user is on a Prometheus datasource, delegate to MonitorTemplateWizard
  if (creationMode === 'ai' && backendType === 'prometheus') {
    return (
      <MonitorTemplateWizard
        onClose={onCancel}
        onCreateMonitors={(templates: AlertTemplate[]) => {
          // Convert AI templates to MonitorFormState
          const forms: PrometheusFormState[] = templates.map((t) => ({
            datasourceType: 'prometheus' as const,
            datasourceId: promForm.datasourceId,
            name: t.name,
            query: t.query,
            threshold: { operator: '>' as const, value: 0, unit: '', forDuration: t.forDuration },
            evaluationInterval: t.evaluationInterval,
            pendingPeriod: t.forDuration,
            firingPeriod: t.forDuration,
            labels: Object.entries(t.labels).map(([key, value]) => ({ key, value })),
            annotations: Object.entries(t.annotations).map(([key, value]) => ({ key, value })),
            severity: t.severity,
            enabled: true,
          }));
          // Use batch save to add all without closing the flyout
          if (onBatchSave) {
            onBatchSave(forms);
          } else {
            forms.forEach((f) => onSave(f));
          }
        }}
      />
    );
  }

  return (
    <>
      <EuiFlyout
        onClose={requestCancel}
        size="l"
        ownFocus
        aria-labelledby="createMonitorFlyoutTitle"
      >
        <EuiFlyoutHeader hasBorder>
          <EuiTitle size="m">
            <h2 id="createMonitorFlyoutTitle">
              {backendType === 'prometheus'
                ? isEdit
                  ? i18n.translate('observability.alerting.createMonitor.editTitleMetrics', {
                      defaultMessage: 'Edit metrics rule',
                    })
                  : i18n.translate('observability.alerting.createMonitor.titleMetrics', {
                      defaultMessage: 'Create metrics rule',
                    })
                : isEdit
                ? i18n.translate('observability.alerting.createMonitor.editTitleLogs', {
                    defaultMessage: 'Edit logs rule',
                  })
                : i18n.translate('observability.alerting.createMonitor.titleLogs', {
                    defaultMessage: 'Create logs rule',
                  })}
            </h2>
          </EuiTitle>
          <EuiSpacer size="s" />
          <EuiText size="xs" color="subdued">
            {backendType === 'prometheus'
              ? i18n.translate('observability.alerting.createMonitor.subtitlePromql', {
                  defaultMessage: 'PromQL-based alerting rule',
                })
              : i18n.translate('observability.alerting.createMonitor.subtitlePpl', {
                  defaultMessage: 'PPL-based alerting rule',
                })}
          </EuiText>
        </EuiFlyoutHeader>

        <EuiFlyoutBody>
          {/* Target Datasource — locked in edit mode (the existing monitor
            already binds a datasource; changing it would require re-creating).
            Scoped to the active backend so a Logs flyout never shows
            Prometheus datasources and vice versa.

            Logs (PPL) form embeds its datasource picker inline in the query
            toolbar, so we only render the standalone selector for the
            Prometheus form. */}
          {/* Prometheus datasource selector moved into the Query section
              of PrometheusFormSection to match Logs layout */}

          {/* Creation Mode Toggle — AI only available for Prometheus, hidden in edit mode */}
          {!isEdit && backendType === 'prometheus' && (
            <>
              <EuiPanel paddingSize="s" hasBorder>
                <EuiFlexGroup gutterSize="m" alignItems="center" responsive={false}>
                  <EuiFlexItem grow={false}>
                    <EuiText size="xs">
                      <strong>
                        {i18n.translate(
                          'observability.alerting.createMonitor.creationMethodLabel',
                          {
                            defaultMessage: 'Creation method',
                          }
                        )}
                      </strong>
                    </EuiText>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiFlexGroup gutterSize="xs" responsive={false}>
                      <EuiFlexItem grow={false}>
                        <EuiBadge
                          color={creationMode === 'manual' ? 'primary' : 'hollow'}
                          onClick={() => setCreationMode('manual')}
                          onClickAriaLabel={i18n.translate(
                            'observability.alerting.createMonitor.manualCreationAriaLabel',
                            { defaultMessage: 'Manual creation' }
                          )}
                        >
                          {i18n.translate('observability.alerting.createMonitor.manualBadge', {
                            defaultMessage: 'Manual',
                          })}
                        </EuiBadge>
                      </EuiFlexItem>
                      <EuiFlexItem grow={false}>
                        <EuiBadge
                          color={creationMode === 'ai' ? 'secondary' : 'hollow'}
                          onClick={() => setCreationMode('ai')}
                          onClickAriaLabel={i18n.translate(
                            'observability.alerting.createMonitor.fromTemplateAriaLabel',
                            { defaultMessage: 'Create from template' }
                          )}
                          iconType="sparkles"
                        >
                          {i18n.translate(
                            'observability.alerting.createMonitor.fromTemplateBadge',
                            {
                              defaultMessage: 'From template',
                            }
                          )}
                        </EuiBadge>
                      </EuiFlexItem>
                    </EuiFlexGroup>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiPanel>
              <EuiSpacer size="m" />
            </>
          )}

          {/* Monitor Name. Severity is intentionally not exposed here — each
              PPL trigger already carries its own severity, and the form-level
              severity field was redundant (the saved monitor's severity is
              derived from its triggers, not from this dropdown). */}
          <EuiFormRow
            label={i18n.translate('observability.alerting.createMonitor.monitorNameLabel', {
              defaultMessage: 'Rule name',
            })}
            fullWidth
            isInvalid={
              duplicateName ||
              (hasSubmitted && (!!validationErrors.name || activeForm.name.trim() === ''))
            }
            error={
              duplicateNameError ||
              (hasSubmitted
                ? validationErrors.name ||
                  (activeForm.name.trim() === ''
                    ? i18n.translate('observability.alerting.createMonitor.nameRequired', {
                        defaultMessage: 'Name is required',
                      })
                    : undefined)
                : undefined)
            }
          >
            <EuiFieldText
              placeholder={
                backendType === 'prometheus'
                  ? i18n.translate(
                      'observability.alerting.createMonitor.monitorNamePlaceholderPrometheus',
                      { defaultMessage: 'e.g. HighCpuUsage, PaymentErrorRate' }
                    )
                  : i18n.translate(
                      'observability.alerting.createMonitor.monitorNamePlaceholderOpensearch',
                      { defaultMessage: 'e.g. High Error Rate, Disk Usage Alert' }
                    )
              }
              value={activeForm.name}
              onChange={(e) => updateName(e.target.value)}
              fullWidth
              aria-label={i18n.translate(
                'observability.alerting.createMonitor.monitorNameAriaLabel',
                {
                  defaultMessage: 'Rule name',
                }
              )}
            />
          </EuiFormRow>

          <EuiSpacer size="m" />

          {/* Enabled toggle — full row directly under Monitor Name. The
              footer save button reads this state to decide between
              "Save & Enable" (checked) and "Save Monitor" (unchecked). */}
          <EuiFormRow
            label={i18n.translate('observability.alerting.createMonitor.enabledLabel', {
              defaultMessage: 'Enabled',
            })}
          >
            <EuiSwitch
              label=""
              checked={activeForm.enabled}
              onChange={(e) => updateEnabled(e.target.checked)}
              aria-label={i18n.translate('observability.alerting.createMonitor.enabledAriaLabel', {
                defaultMessage: 'Enabled',
              })}
              data-test-subj="alertManagerEnabledSwitch"
            />
          </EuiFormRow>

          <EuiSpacer size="m" />

          {/* Backend-specific form */}
          {backendType === 'prometheus' ? (
            <PrometheusFormSection
              form={promForm}
              onUpdate={updateProm}
              validationErrors={validationErrors}
              hasSubmitted={hasSubmitted}
              context={context}
              datasourceId={promForm.datasourceId}
              datasources={datasources.filter((d) => d.type === 'prometheus')}
            />
          ) : (
            <OpenSearchFormSection
              form={osForm}
              onUpdate={updateOs}
              validationErrors={validationErrors}
              hasSubmitted={hasSubmitted}
              datasources={datasources.filter((d) => d.type === 'opensearch')}
              onDatasourceChange={(id) => handleDatasourceChange(id, 'opensearch')}
              isEdit={isEdit}
              pplServerError={submitError?.pplMessage}
              hideBuildInLogsLink={hideBuildInLogsLink}
            />
          )}
        </EuiFlyoutBody>

        <EuiFlyoutFooter>
          <EuiFlexGroup justifyContent="spaceBetween" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty onClick={requestCancel}>
                {i18n.translate('observability.alerting.createMonitor.cancelButton', {
                  defaultMessage: 'Cancel',
                })}
              </EuiButtonEmpty>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              {/* Single save button whose label tracks the Enabled toggle in
                  the header. Edit mode keeps "Save Changes" (the toggle is
                  semantically separate from "save my edits"); create mode
                  reads the toggle to pick "Save & enable" vs "Save rule".
                  The form-state's `enabled` flag is what gets persisted, so
                  the button copy is purely affordance — clicking either
                  variant saves the rule in the state the toggle reflects.
                  `isSaving` (from upstream's double-save guard) disables the
                  button while a save is in flight; `isLoading` shows the
                  spinner so the user knows their click registered. */}
              <EuiButton
                fill
                onClick={handleSave}
                isDisabled={!isValid || isSaving}
                isLoading={isSaving}
              >
                {isSaving && backendType === 'prometheus'
                  ? i18n.translate('observability.alerting.createMonitor.savingPrometheus', {
                      defaultMessage: 'Creating in Prometheus...',
                    })
                  : isEdit
                  ? i18n.translate('observability.alerting.createMonitor.saveChangesButton', {
                      defaultMessage: 'Save Changes',
                    })
                  : activeForm.enabled
                  ? i18n.translate('observability.alerting.createMonitor.saveAndEnableButton', {
                      defaultMessage: 'Save & enable',
                    })
                  : i18n.translate('observability.alerting.createMonitor.saveMonitorButton', {
                      defaultMessage: 'Save rule',
                    })}
              </EuiButton>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlyoutFooter>
      </EuiFlyout>
      {showDiscardConfirm && (
        <EuiOverlayMask>
          <EuiConfirmModal
            title={i18n.translate('observability.alerting.createMonitor.discardConfirmTitle', {
              defaultMessage: 'Discard unsaved changes?',
            })}
            onCancel={() => setShowDiscardConfirm(false)}
            onConfirm={() => {
              setShowDiscardConfirm(false);
              onCancel();
            }}
            cancelButtonText={i18n.translate(
              'observability.alerting.createMonitor.discardConfirmCancel',
              { defaultMessage: 'Keep editing' }
            )}
            confirmButtonText={i18n.translate(
              'observability.alerting.createMonitor.discardConfirmConfirm',
              { defaultMessage: 'Discard changes' }
            )}
            buttonColor="danger"
            defaultFocusedButton="cancel"
            data-test-subj="alertManagerDiscardChangesConfirm"
          >
            <p>
              {i18n.translate('observability.alerting.createMonitor.discardConfirmBody', {
                defaultMessage:
                  "You've made changes to this rule that haven't been saved. Discarding will lose them.",
              })}
            </p>
          </EuiConfirmModal>
        </EuiOverlayMask>
      )}
    </>
  );
};
