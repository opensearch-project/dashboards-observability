/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SLO creation wizard — template-driven, orchestrates section components.
 * Produces a correct SloCreateInput ({ id?, spec: SloSpec }) and submits.
 *
 * State + reducer live in wizard_state.ts; state → SloCreateInput in
 * wizard_builders.ts. This file is the orchestrator + top-level layout.
 *
 * Probe-SLI button is intentionally NOT wired here — it lands with the
 * rule-health probe in PR 4.
 */

import React, { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiCard,
  EuiCheckbox,
  EuiFieldText,
  EuiFlexGrid,
  EuiFlexGroup,
  EuiFlexItem,
  EuiForm,
  EuiFormRow,
  EuiIcon,
  EuiPage,
  EuiPageBody,
  EuiPageContent,
  EuiPageContentBody,
  EuiPanel,
  EuiSelect,
  EuiSpacer,
  EuiText,
  EuiTextArea,
} from '@elastic/eui';
import { Prompt, useHistory, useParams } from 'react-router-dom';
import type { ChromeStart, NotificationsStart } from '../../../../../../../src/core/public';
import { extractRulerErrorEnvelope } from './slo_api_client';
import type { SloApiClient, SloRulerErrorEnvelope } from './slo_api_client';
import { GeneratedRulesPreview } from './generated_rules_preview';
import { ObjectivesSection } from './objectives_section';
import { CustomPromqlEditor } from './custom_promql_editor';
import { AdvancedSection } from './advanced_section';
import { ExclusionWindowsEditor } from './exclusion_windows_editor';
import type { SloCreateInput } from '../../../../../common/slo/slo_types';
import { SLO_TEMPLATES } from '../../../../../common/slo/slo_templates';
import type { SloTemplate } from '../../../../../common/slo/slo_templates';
import { validateSloSpec } from '../../../../../common/slo/slo_validators';
import { initialState, reducer } from './wizard_state';
import type { Action, FormState } from './wizard_state';
import { buildCreateInput } from './wizard_builders';
import { WizardNav } from './wizard_nav';
import { WIZARD_SECTIONS } from './wizard_sections';
import type { WizardSectionId } from './wizard_sections';
import { WizardValidationSummary } from './wizard_validation_summary';
import { WizardKeyValueGrid } from './wizard_key_value_grid';

function sectionAnchorId(id: WizardSectionId): string {
  const found = WIZARD_SECTIONS.find((s) => s.id === id);
  if (!found) throw new Error(`unknown wizard section id: ${id}`);
  return found.anchorId;
}

export interface SloWizardPageProps {
  apiClient: SloApiClient;
  chrome: ChromeStart;
  notifications: NotificationsStart;
  parentBreadcrumb: { text: string; href: string };
}

const UNSAVED_PROMPT =
  'You have unsaved changes. Are you sure you want to leave this page? Your form will be lost.';

// ============================================================================
// Template selector
// ============================================================================

const CATEGORY_TITLES: Record<string, string> = {
  apm: 'APM service SLOs (span-derived)',
  otel: 'OTel semconv metrics',
  custom: 'Custom',
};

const CATEGORY_ORDER: ReadonlyArray<'apm' | 'otel' | 'custom'> = ['apm', 'otel', 'custom'];

const TemplateSelector: React.FC<{ onPick: (id: string) => void }> = ({ onPick }) => (
  <EuiPanel>
    <EuiText size="m">
      <h4>Pick a template</h4>
    </EuiText>
    <EuiText size="s" color="subdued">
      APM templates build SLIs from the span-derived RED metrics Data Prepper produces for every
      traced service. OTel templates target direct semconv metrics (HTTP, RPC, DB, messaging,
      GenAI). Custom starts from blank PromQL.
    </EuiText>
    {CATEGORY_ORDER.map((category) => {
      const templates = SLO_TEMPLATES.filter((t) => t.category === category);
      if (templates.length === 0) return null;
      return (
        <React.Fragment key={category}>
          <EuiSpacer size="m" />
          <EuiText size="xs" color="subdued">
            <strong>{CATEGORY_TITLES[category] ?? category}</strong>
          </EuiText>
          <EuiSpacer size="s" />
          <EuiFlexGrid columns={3}>
            {templates.map((t) => (
              <EuiFlexItem key={t.id}>
                <EuiCard
                  icon={<EuiIcon size="xl" type={t.icon} />}
                  title={t.name}
                  description={t.description}
                  onClick={() => onPick(t.id)}
                  data-test-subj={`slosTemplate-${t.id}`}
                />
              </EuiFlexItem>
            ))}
          </EuiFlexGrid>
        </React.Fragment>
      );
    })}
  </EuiPanel>
);

// ============================================================================
// Main wizard
// ============================================================================

export const SloWizardPage: React.FC<SloWizardPageProps> = ({
  apiClient,
  chrome,
  notifications,
  parentBreadcrumb,
}) => {
  const history = useHistory();
  const { templateId: urlTemplateId } = useParams<{ templateId?: string }>();
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [rulerError, setRulerError] = useState<SloRulerErrorEnvelope | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [createdSuccessfully, setCreatedSuccessfully] = useState(false);

  // Initialize from URL template on mount.
  useEffect(() => {
    if (urlTemplateId && state.templateId !== urlTemplateId) {
      dispatch({ kind: 'setTemplate', templateId: urlTemplateId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlTemplateId]);

  useEffect(() => {
    chrome.setBreadcrumbs([
      parentBreadcrumb,
      { text: 'SLO/SLI', href: '#/slos' },
      { text: 'Create' },
    ]);
  }, [chrome, parentBreadcrumb]);

  const template = useMemo(() => SLO_TEMPLATES.find((t) => t.id === state.templateId) ?? null, [
    state.templateId,
  ]);

  // Build the current input + live warnings. Preview uses the input; warnings
  // surface advisories (e.g. rolling-window >3d approximation) without
  // gating submit. Errors remain submit-gated so typing doesn't produce a
  // sea of red before the user has finished a field.
  const liveInput = useMemo<SloCreateInput | null>(
    () => (template ? buildCreateInput(state, template) : null),
    [state, template]
  );
  // Live warnings + errors are derived from the live input. Warnings render
  // unconditionally (advisory). Errors drive the rule-preview empty-state
  // list — *before* the user has clicked submit. Distinct from the `errors`
  // state variable which only populates after submit (and gates the top-
  // level summary).
  const { liveErrors, warnings } = useMemo<{
    liveErrors: Record<string, string>;
    warnings: Record<string, string>;
  }>(() => {
    if (!liveInput) return { liveErrors: {}, warnings: {} };
    const result = validateSloSpec(liveInput.spec);
    return { liveErrors: result.errors, warnings: result.warnings };
  }, [liveInput]);

  // Track dirty state for the unsaved-changes prompt. The wizard becomes
  // dirty once the user types anything beyond the template default — we use
  // "submitted at least one field's first character" as the proxy here.
  const dirty = useMemo(() => {
    return (
      state.name !== '' ||
      state.description !== '' ||
      state.service !== '' ||
      state.ownerTeam !== '' ||
      state.ownerPrimaryUser !== '' ||
      state.tier !== '' ||
      state.datasourceId !== '' ||
      state.labels.length > 0 ||
      state.annotations.length > 0 ||
      state.exclusionWindows.length > 0
    );
  }, [state]);

  const onPickTemplate = useCallback(
    (id: string) => {
      history.replace(`/slos/create/${encodeURIComponent(id)}`);
      dispatch({ kind: 'setTemplate', templateId: id });
    },
    [history]
  );

  const onSubmit = useCallback(async () => {
    if (!template) return;
    dispatch({ kind: 'markSubmitAttempted' });
    const input = buildCreateInput(state, template);
    const { errors: specErrors } = validateSloSpec(input.spec);
    if (Object.keys(specErrors).length > 0) {
      setErrors(specErrors);
      notifications.toasts.addWarning({
        title: 'Fix validation errors',
        text: 'Some required fields are missing or invalid.',
      });
      return;
    }
    setErrors({});
    setRulerError(null);
    setSubmitting(true);
    try {
      const doc = await apiClient.create(input);
      // Allow the post-create redirect to land without the unsaved-changes
      // prompt firing on the navigation away.
      setCreatedSuccessfully(true);
      notifications.toasts.addSuccess({
        title: 'SLO created',
        text: `${doc.spec.name} is now provisioned.`,
      });
      history.push(`/slos/${encodeURIComponent(doc.id)}`);
    } catch (e) {
      // Ruler dual-write envelope: surface the raw upstream message inline.
      // `rawBody` is the user-actionable diagnostic (e.g. "invalid PromQL:
      // parse error at char 42"); a generic toast would hide it.
      const envelope = extractRulerErrorEnvelope(e);
      if (envelope) {
        setRulerError(envelope);
      } else {
        const err = e instanceof Error ? e : new Error(String(e));
        notifications.toasts.addDanger({
          title: 'Failed to create SLO',
          text: err.message,
        });
      }
    } finally {
      setSubmitting(false);
    }
  }, [apiClient, history, notifications, state, template]);

  if (!template) {
    return (
      <EuiPage data-test-subj="sloWizardPage">
        <EuiPageBody component="main">
          <EuiPageContent color="transparent" hasBorder={false} paddingSize="none">
            <EuiPageContentBody>
              <EuiFlexGroup gutterSize="s" justifyContent="flexEnd">
                <EuiFlexItem grow={false}>
                  <EuiButtonEmpty
                    iconType="arrowLeft"
                    href="#/slos"
                    size="s"
                    data-test-subj="slosCancel"
                  >
                    Back to SLOs
                  </EuiButtonEmpty>
                </EuiFlexItem>
              </EuiFlexGroup>
              <EuiSpacer size="m" />
              <TemplateSelector onPick={onPickTemplate} />
            </EuiPageContentBody>
          </EuiPageContent>
        </EuiPageBody>
      </EuiPage>
    );
  }

  const visibleSectionIds: WizardSectionId[] = [
    'identity',
    'window',
    'owner',
    'sli',
    ...(template.sli.type === 'custom' ? (['promql'] as WizardSectionId[]) : []),
    'objectives',
    'advanced',
    'exclusions',
    'labels',
    'rulesPreview',
  ];

  return (
    <EuiPage data-test-subj="sloWizardPage">
      <EuiPageBody component="main">
        {/* Block in-app navigation when the form is dirty and we haven't
            successfully submitted yet. `submitting` is allowed through so the
            post-create `history.push('/slos/<id>')` redirect lands. */}
        <Prompt when={dirty && !createdSuccessfully && !submitting} message={UNSAVED_PROMPT} />
        <EuiPageContent color="transparent" hasBorder={false} paddingSize="none">
          <EuiPageContentBody>
            <EuiFlexGroup gutterSize="s" justifyContent="flexEnd" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty
                  iconType="arrowLeft"
                  onClick={() => history.replace('/slos/create')}
                  size="s"
                  data-test-subj="slosTemplateBack"
                >
                  Change template
                </EuiButtonEmpty>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty href="#/slos" size="s" data-test-subj="slosWizardCancel">
                  Cancel
                </EuiButtonEmpty>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButton
                  fill
                  size="s"
                  isLoading={submitting}
                  onClick={onSubmit}
                  data-test-subj="slosWizardSubmit"
                >
                  Create SLO
                </EuiButton>
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="m" />
            <EuiFlexGroup gutterSize="l" alignItems="flexStart">
              <EuiFlexItem grow={false}>
                <WizardNav errors={errors} visibleSectionIds={visibleSectionIds} />
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiForm component="form">
                  {state.submitAttempted && <WizardValidationSummary errors={errors} />}

                  <div id={sectionAnchorId('identity')}>
                    <IdentityPanel
                      state={state}
                      errors={errors}
                      dispatch={dispatch}
                      template={template.name}
                    />
                  </div>

                  <EuiSpacer size="m" />

                  <div id={sectionAnchorId('window')}>
                    <WindowPanel state={state} warnings={warnings} dispatch={dispatch} />
                  </div>

                  <EuiSpacer size="m" />

                  <div id={sectionAnchorId('owner')}>
                    <OwnerPanel state={state} errors={errors} dispatch={dispatch} />
                  </div>

                  <EuiSpacer size="m" />

                  {template.note && (
                    <>
                      <EuiCallOut
                        size="s"
                        color="primary"
                        iconType="iInCircle"
                        title={template.note}
                        data-test-subj="slosWizardTemplateNote"
                      />
                      <EuiSpacer size="m" />
                    </>
                  )}

                  <div id={sectionAnchorId('sli')}>
                    <SliPanel
                      state={state}
                      errors={errors}
                      dispatch={dispatch}
                      template={template}
                    />
                  </div>

                  <EuiSpacer size="m" />

                  {template.sli.type === 'custom' && (
                    <>
                      <div id={sectionAnchorId('promql')}>
                        <CustomPromqlEditor
                          value={state.customPromql}
                          errors={errors}
                          dispatch={dispatch}
                        />
                      </div>
                      <EuiSpacer size="m" />
                    </>
                  )}

                  <div id={sectionAnchorId('objectives')}>
                    <ObjectivesSection
                      objectives={state.objectives}
                      latencyThresholdUnit={state.latencyThresholdUnit}
                      windowDuration={state.windowDuration}
                      template={template}
                      errors={errors}
                      dispatch={dispatch}
                    />
                  </div>

                  <EuiSpacer size="m" />

                  <div id={sectionAnchorId('advanced')}>
                    <AdvancedSection
                      burnRates={state.burnRates}
                      budgetWarnings={state.budgetWarnings}
                      alarms={state.alarms}
                      errors={errors}
                      dispatch={dispatch}
                    />
                  </div>

                  <EuiSpacer size="m" />

                  <div id={sectionAnchorId('exclusions')}>
                    <ExclusionWindowsEditor
                      exclusionWindows={state.exclusionWindows}
                      dispatch={dispatch}
                    />
                  </div>

                  <EuiSpacer size="m" />

                  <div id={sectionAnchorId('labels')}>
                    <LabelsAnnotationsPanel state={state} errors={errors} dispatch={dispatch} />
                  </div>

                  <EuiSpacer size="m" />

                  <div id={sectionAnchorId('rulesPreview')}>
                    <GeneratedRulesPreview
                      apiClient={apiClient}
                      input={liveInput}
                      errors={liveErrors}
                    />
                  </div>

                  {rulerError && (
                    <>
                      <EuiSpacer size="m" />
                      <EuiCallOut
                        title={rulerErrorTitle(rulerError)}
                        color="danger"
                        iconType="alert"
                        data-test-subj="slosWizardRulerError"
                      >
                        <EuiText size="s">
                          <p data-test-subj="slosWizardRulerErrorBody">{rulerError.rawBody}</p>
                          <p>
                            <small>
                              Code: <code>{rulerError.code}</code> · upstream HTTP{' '}
                              {rulerError.httpStatus}
                            </small>
                          </p>
                        </EuiText>
                      </EuiCallOut>
                    </>
                  )}
                </EuiForm>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiPageContentBody>
        </EuiPageContent>
      </EuiPageBody>
    </EuiPage>
  );
};

// ============================================================================
// Inline panels (identity / owner / SLI / window / labels)
//
// Kept in-file because each is a thin wrapper over EuiFormRow+EuiFieldText
// against a single state slice. Extracting would add import noise without
// reducing coupling — they all depend on the same reducer.
// ============================================================================

interface PanelProps {
  state: FormState;
  errors: Record<string, string>;
  dispatch: React.Dispatch<Action>;
}

const IdentityPanel: React.FC<PanelProps & { template: string }> = ({
  state,
  errors,
  dispatch,
  template,
}) => (
  <EuiPanel>
    <EuiText size="m">
      <h4>{template} — identity</h4>
    </EuiText>
    <EuiSpacer size="s" />
    <EuiFormRow
      label="Datasource ID"
      isInvalid={!!errors['spec.datasourceId']}
      error={errors['spec.datasourceId']}
    >
      <EuiFieldText
        value={state.datasourceId}
        onChange={(e) =>
          dispatch({ kind: 'setField', field: 'datasourceId', value: e.target.value })
        }
        data-test-subj="slosWizardDatasourceId"
        placeholder="ds-2"
      />
    </EuiFormRow>
    <EuiFormRow label="Name" isInvalid={!!errors['spec.name']} error={errors['spec.name']}>
      <EuiFieldText
        value={state.name}
        onChange={(e) => dispatch({ kind: 'setField', field: 'name', value: e.target.value })}
        data-test-subj="slosWizardName"
      />
    </EuiFormRow>
    <EuiFormRow label="Description">
      <EuiTextArea
        rows={2}
        value={state.description}
        onChange={(e) =>
          dispatch({ kind: 'setField', field: 'description', value: e.target.value })
        }
        data-test-subj="slosWizardDescription"
      />
    </EuiFormRow>
  </EuiPanel>
);

const OwnerPanel: React.FC<PanelProps> = ({ state, errors, dispatch }) => (
  <EuiPanel>
    <EuiText size="m">
      <h4>Service &amp; owner</h4>
    </EuiText>
    <EuiSpacer size="s" />
    <EuiFormRow label="Service" isInvalid={!!errors['spec.service']} error={errors['spec.service']}>
      <EuiFieldText
        value={state.service}
        onChange={(e) => dispatch({ kind: 'setField', field: 'service', value: e.target.value })}
        data-test-subj="slosWizardService"
      />
    </EuiFormRow>
    <EuiFormRow
      label="Primary team"
      isInvalid={!!errors['spec.owner.teams']}
      error={errors['spec.owner.teams']}
    >
      <EuiFieldText
        value={state.ownerTeam}
        onChange={(e) => dispatch({ kind: 'setField', field: 'ownerTeam', value: e.target.value })}
        data-test-subj="slosWizardOwnerTeam"
      />
    </EuiFormRow>
    <EuiFormRow label="Primary user (optional)">
      <EuiFieldText
        value={state.ownerPrimaryUser}
        onChange={(e) =>
          dispatch({ kind: 'setField', field: 'ownerPrimaryUser', value: e.target.value })
        }
        data-test-subj="slosWizardOwnerPrimaryUser"
      />
    </EuiFormRow>
    <EuiFormRow label="Tier (optional)">
      <EuiFieldText
        value={state.tier}
        onChange={(e) => dispatch({ kind: 'setField', field: 'tier', value: e.target.value })}
        data-test-subj="slosWizardTier"
      />
    </EuiFormRow>
  </EuiPanel>
);

const SliPanel: React.FC<PanelProps & { template: SloTemplate }> = ({
  state,
  errors,
  dispatch,
  template,
}) => (
  <EuiPanel>
    <EuiText size="m">
      <h4>SLI</h4>
    </EuiText>
    <EuiSpacer size="s" />
    {template.sli.type === 'availability' && (
      <EuiFormRow
        label="Good events filter"
        helpText={`Default: ${template.sli.goodEventsFilter ?? ''}`}
      >
        <EuiFieldText
          value={state.goodEventsFilter}
          onChange={(e) =>
            dispatch({ kind: 'setField', field: 'goodEventsFilter', value: e.target.value })
          }
          data-test-subj="slosWizardGoodEventsFilter"
        />
      </EuiFormRow>
    )}
    <EuiFormRow
      label={template.sli.type === 'custom' ? 'Dimensions (optional)' : 'Dimensions'}
      isInvalid={!!errors['spec.sli.dimensions']}
      error={errors['spec.sli.dimensions']}
      fullWidth
    >
      <div>
        {state.dimensions.map((dim, i) => (
          <EuiFlexGroup key={i} gutterSize="s" alignItems="flexEnd" style={{ marginBottom: 4 }}>
            <EuiFlexItem>
              <EuiFieldText
                placeholder="label name"
                value={dim.name}
                onChange={(e) =>
                  dispatch({
                    kind: 'setDimension',
                    index: i,
                    dim: { ...dim, name: e.target.value },
                  })
                }
                data-test-subj={`slosWizardDimName-${i}`}
                compressed
              />
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiFieldText
                placeholder="label value"
                value={dim.value}
                onChange={(e) =>
                  dispatch({
                    kind: 'setDimension',
                    index: i,
                    dim: { ...dim, value: e.target.value },
                  })
                }
                data-test-subj={`slosWizardDimValue-${i}`}
                compressed
              />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty
                color="danger"
                onClick={() => dispatch({ kind: 'removeDimension', index: i })}
                disabled={state.dimensions.length <= 1}
                iconType="trash"
                aria-label="Remove dimension"
                size="s"
                data-test-subj={`slosWizardDimRemove-${i}`}
              />
            </EuiFlexItem>
          </EuiFlexGroup>
        ))}
        <EuiButtonEmpty
          iconType="plusInCircle"
          size="s"
          onClick={() => dispatch({ kind: 'addDimension' })}
          data-test-subj="slosWizardDimAdd"
        >
          Add dimension
        </EuiButtonEmpty>
      </div>
    </EuiFormRow>
  </EuiPanel>
);

const WindowPanel: React.FC<{
  state: FormState;
  warnings: Record<string, string>;
  dispatch: React.Dispatch<Action>;
}> = ({ state, warnings, dispatch }) => (
  <EuiPanel>
    <EuiText size="m">
      <h4>Window &amp; mode</h4>
    </EuiText>
    <EuiSpacer size="s" />
    <EuiFormRow label="Rolling window">
      <EuiSelect
        value={state.windowDuration}
        onChange={(e) =>
          dispatch({
            kind: 'setField',
            field: 'windowDuration',
            value: e.target.value as FormState['windowDuration'],
          })
        }
        options={[
          { value: '7d', text: '7 days' },
          { value: '14d', text: '14 days' },
          { value: '28d', text: '28 days (recommended)' },
          { value: '30d', text: '30 days' },
        ]}
        data-test-subj="slosWizardWindow"
      />
    </EuiFormRow>
    {warnings['spec.window.duration'] && (
      <>
        <EuiSpacer size="s" />
        <EuiCallOut
          title="Window approximation"
          color="warning"
          iconType="iInCircle"
          size="s"
          data-test-subj="slosWizardWindowWarning"
        >
          <EuiText size="s">{warnings['spec.window.duration']}</EuiText>
        </EuiCallOut>
      </>
    )}
    <EuiCheckbox
      id="slosWizardShadow"
      label="Shadow mode (deploy recording rules only; suppress alerts)"
      checked={state.shadow}
      onChange={(e) => dispatch({ kind: 'setField', field: 'shadow', value: e.target.checked })}
      data-test-subj="slosWizardShadow"
    />
  </EuiPanel>
);

const LabelsAnnotationsPanel: React.FC<PanelProps> = ({ state, errors, dispatch }) => {
  // Per-label validator errors are keyed as `spec.labels["<name>"]`. Walk the
  // live labels array in order and attach the matching error to the row that
  // declared the offending key. Untouched rows (empty key) surface no error.
  const labelRowErrors = state.labels.map((entry) => {
    if (!entry.key) return undefined;
    return errors[`spec.labels["${entry.key}"]`];
  });
  // Annotation size-cap errors land on the scalar `spec.annotations` key —
  // there's no per-row addressability. Attach to every row so at least the
  // user sees the cap violation.
  const annotationScalarError = errors['spec.annotations'];
  const annotationRowErrors = state.annotations.map(() => annotationScalarError);

  return (
    <EuiPanel>
      <EuiText size="m">
        <h4>Labels &amp; annotations (optional)</h4>
      </EuiText>
      <EuiText size="xs" color="subdued">
        Labels propagate to rules as <code>slo_label_&lt;key&gt;</code>. Annotations stay on the
        document (e.g., runbook URLs).
      </EuiText>
      <EuiSpacer size="s" />
      <EuiFormRow
        label="Labels"
        fullWidth
        data-test-subj="slosWizardLabelsRow"
        display="rowCompressed"
      >
        <WizardKeyValueGrid
          entries={state.labels}
          rowErrors={labelRowErrors}
          onChange={(index, field, value) =>
            dispatch({ kind: 'setLabelEntry', index, field, value })
          }
          onAdd={() => dispatch({ kind: 'addLabelEntry' })}
          onRemove={(index) => dispatch({ kind: 'removeLabelEntry', index })}
          testSubjPrefix="slosWizardLabel"
          addLabel="Add label"
          keyPlaceholder="compliance"
          valuePlaceholder="pci"
        />
      </EuiFormRow>
      <EuiSpacer size="s" />
      <EuiFormRow
        label="Annotations"
        fullWidth
        isInvalid={!!annotationScalarError}
        error={annotationScalarError}
        data-test-subj="slosWizardAnnotationsRow"
        display="rowCompressed"
      >
        <WizardKeyValueGrid
          entries={state.annotations}
          rowErrors={annotationRowErrors}
          onChange={(index, field, value) =>
            dispatch({ kind: 'setAnnotationEntry', index, field, value })
          }
          onAdd={() => dispatch({ kind: 'addAnnotationEntry' })}
          onRemove={(index) => dispatch({ kind: 'removeAnnotationEntry', index })}
          testSubjPrefix="slosWizardAnnotation"
          addLabel="Add annotation"
          keyPlaceholder="runbook"
          valuePlaceholder="https://wiki/slo/..."
        />
      </EuiFormRow>
    </EuiPanel>
  );
};

function rulerErrorTitle(envelope: SloRulerErrorEnvelope): string {
  switch (envelope.code) {
    case 'RULER_VALIDATION_FAILED':
      return 'Ruler rejected the rule group';
    case 'RULER_AUTH_FAILED':
      return 'Ruler authentication failed';
    case 'RULER_UNREACHABLE':
      return 'Ruler is unreachable';
  }
}
