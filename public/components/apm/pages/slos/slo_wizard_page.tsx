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
import { i18n } from '@osd/i18n';
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
import { extractRulerErrorEnvelope, extractServerMessage } from './slo_api_client';
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

const I18N = {
  unsavedPrompt: i18n.translate('observability.slo.wizard.unsavedPrompt', {
    defaultMessage:
      'You have unsaved changes. Are you sure you want to leave this page? Your form will be lost.',
  }),
  breadcrumbSloSli: i18n.translate('observability.slo.wizard.breadcrumbSloSli', {
    defaultMessage: 'SLO/SLI',
  }),
  breadcrumbCreate: i18n.translate('observability.slo.wizard.breadcrumbCreate', {
    defaultMessage: 'Create',
  }),
  toastFixValidationTitle: i18n.translate('observability.slo.wizard.toastFixValidationTitle', {
    defaultMessage: 'Fix validation errors',
  }),
  toastFixValidationText: i18n.translate('observability.slo.wizard.toastFixValidationText', {
    defaultMessage: 'Some required fields are missing or invalid.',
  }),
  toastCreatedTitle: i18n.translate('observability.slo.wizard.toastCreatedTitle', {
    defaultMessage: 'SLO created',
  }),
  toastCreatedText: (name: string) =>
    i18n.translate('observability.slo.wizard.toastCreatedText', {
      defaultMessage: '{name} is now provisioned.',
      values: { name },
    }),
  toastCreateFailedTitle: i18n.translate('observability.slo.wizard.toastCreateFailedTitle', {
    defaultMessage: 'Failed to create SLO',
  }),
  backToSlos: i18n.translate('observability.slo.wizard.backToSlos', {
    defaultMessage: 'Back to SLOs',
  }),
  changeTemplate: i18n.translate('observability.slo.wizard.changeTemplate', {
    defaultMessage: 'Change template',
  }),
  cancel: i18n.translate('observability.slo.wizard.cancel', {
    defaultMessage: 'Cancel',
  }),
  createSlo: i18n.translate('observability.slo.wizard.createSlo', {
    defaultMessage: 'Create SLO',
  }),
  rulerCodeUpstreamHttpPrefix: i18n.translate(
    'observability.slo.wizard.rulerCodeUpstreamHttpPrefix',
    {
      defaultMessage: 'Code:',
    }
  ),
  rulerUpstreamHttp: (httpStatus: number) =>
    i18n.translate('observability.slo.wizard.rulerUpstreamHttp', {
      defaultMessage: 'upstream HTTP {httpStatus}',
      values: { httpStatus },
    }),
  pickTemplateHeading: i18n.translate('observability.slo.wizard.pickTemplateHeading', {
    defaultMessage: 'Pick a template',
  }),
  pickTemplateDescription: i18n.translate('observability.slo.wizard.pickTemplateDescription', {
    defaultMessage:
      'APM templates build SLIs from the span-derived RED metrics Data Prepper produces for every traced service. OTel templates target direct semconv metrics (HTTP, RPC, DB, messaging, GenAI). Custom starts from blank PromQL.',
  }),
  categoryApm: i18n.translate('observability.slo.wizard.categoryApm', {
    defaultMessage: 'APM service SLOs (span-derived)',
  }),
  categoryOtel: i18n.translate('observability.slo.wizard.categoryOtel', {
    defaultMessage: 'OTel semconv metrics',
  }),
  categoryCustom: i18n.translate('observability.slo.wizard.categoryCustom', {
    defaultMessage: 'Custom',
  }),
  identityHeading: (template: string) =>
    i18n.translate('observability.slo.wizard.identityHeading', {
      defaultMessage: '{template} — identity',
      values: { template },
    }),
  datasourceLabel: i18n.translate('observability.slo.wizard.datasourceLabel', {
    defaultMessage: 'Datasource ID',
  }),
  datasourcePlaceholder: i18n.translate('observability.slo.wizard.datasourcePlaceholder', {
    defaultMessage: 'ds-2',
  }),
  nameLabel: i18n.translate('observability.slo.wizard.nameLabel', {
    defaultMessage: 'Name',
  }),
  descriptionLabel: i18n.translate('observability.slo.wizard.descriptionLabel', {
    defaultMessage: 'Description',
  }),
  ownerHeading: i18n.translate('observability.slo.wizard.ownerHeading', {
    defaultMessage: 'Service & owner',
  }),
  serviceLabel: i18n.translate('observability.slo.wizard.serviceLabel', {
    defaultMessage: 'Service',
  }),
  primaryTeamLabel: i18n.translate('observability.slo.wizard.primaryTeamLabel', {
    defaultMessage: 'Primary team',
  }),
  primaryUserLabel: i18n.translate('observability.slo.wizard.primaryUserLabel', {
    defaultMessage: 'Primary user (optional)',
  }),
  tierLabel: i18n.translate('observability.slo.wizard.tierLabel', {
    defaultMessage: 'Tier (optional)',
  }),
  sliHeading: i18n.translate('observability.slo.wizard.sliHeading', {
    defaultMessage: 'SLI',
  }),
  goodEventsLabel: i18n.translate('observability.slo.wizard.goodEventsLabel', {
    defaultMessage: 'Good events filter',
  }),
  goodEventsHelpText: (defaultFilter: string) =>
    i18n.translate('observability.slo.wizard.goodEventsHelpText', {
      defaultMessage: 'Default: {defaultFilter}',
      values: { defaultFilter },
    }),
  dimensionsLabel: i18n.translate('observability.slo.wizard.dimensionsLabel', {
    defaultMessage: 'Dimensions',
  }),
  dimensionsLabelOptional: i18n.translate('observability.slo.wizard.dimensionsLabelOptional', {
    defaultMessage: 'Dimensions (optional)',
  }),
  dimensionNamePlaceholder: i18n.translate('observability.slo.wizard.dimensionNamePlaceholder', {
    defaultMessage: 'label name',
  }),
  dimensionValuePlaceholder: i18n.translate('observability.slo.wizard.dimensionValuePlaceholder', {
    defaultMessage: 'label value',
  }),
  removeDimensionAria: i18n.translate('observability.slo.wizard.removeDimensionAria', {
    defaultMessage: 'Remove dimension',
  }),
  addDimension: i18n.translate('observability.slo.wizard.addDimension', {
    defaultMessage: 'Add dimension',
  }),
  windowHeading: i18n.translate('observability.slo.wizard.windowHeading', {
    defaultMessage: 'Window & mode',
  }),
  rollingWindowLabel: i18n.translate('observability.slo.wizard.rollingWindowLabel', {
    defaultMessage: 'Rolling window',
  }),
  window7d: i18n.translate('observability.slo.wizard.window7d', {
    defaultMessage: '7 days',
  }),
  window14d: i18n.translate('observability.slo.wizard.window14d', {
    defaultMessage: '14 days',
  }),
  window28d: i18n.translate('observability.slo.wizard.window28d', {
    defaultMessage: '28 days (recommended)',
  }),
  window30d: i18n.translate('observability.slo.wizard.window30d', {
    defaultMessage: '30 days',
  }),
  windowApproximationTitle: i18n.translate('observability.slo.wizard.windowApproximationTitle', {
    defaultMessage: 'Window approximation',
  }),
  shadowModeLabel: i18n.translate('observability.slo.wizard.shadowModeLabel', {
    defaultMessage: 'Shadow mode (deploy recording rules only; suppress alerts)',
  }),
  labelsHeading: i18n.translate('observability.slo.wizard.labelsHeading', {
    defaultMessage: 'Labels & annotations (optional)',
  }),
  labelsDescriptionPrefix: i18n.translate('observability.slo.wizard.labelsDescriptionPrefix', {
    defaultMessage: 'Labels propagate to rules as',
  }),
  labelsDescriptionSuffix: i18n.translate('observability.slo.wizard.labelsDescriptionSuffix', {
    defaultMessage: '. Annotations stay on the document (e.g., runbook URLs).',
  }),
  labelsLabel: i18n.translate('observability.slo.wizard.labelsLabel', {
    defaultMessage: 'Labels',
  }),
  annotationsLabel: i18n.translate('observability.slo.wizard.annotationsLabel', {
    defaultMessage: 'Annotations',
  }),
  addLabel: i18n.translate('observability.slo.wizard.addLabel', {
    defaultMessage: 'Add label',
  }),
  addAnnotation: i18n.translate('observability.slo.wizard.addAnnotation', {
    defaultMessage: 'Add annotation',
  }),
  labelKeyPlaceholder: i18n.translate('observability.slo.wizard.labelKeyPlaceholder', {
    defaultMessage: 'compliance',
  }),
  labelValuePlaceholder: i18n.translate('observability.slo.wizard.labelValuePlaceholder', {
    defaultMessage: 'pci',
  }),
  annotationKeyPlaceholder: i18n.translate('observability.slo.wizard.annotationKeyPlaceholder', {
    defaultMessage: 'runbook',
  }),
  annotationValuePlaceholder: i18n.translate(
    'observability.slo.wizard.annotationValuePlaceholder',
    {
      defaultMessage: 'https://wiki/slo/...',
    }
  ),
  rulerErrorValidation: i18n.translate('observability.slo.wizard.rulerErrorValidation', {
    defaultMessage: 'Ruler rejected the rule group',
  }),
  rulerErrorAuth: i18n.translate('observability.slo.wizard.rulerErrorAuth', {
    defaultMessage: 'Ruler authentication failed',
  }),
  rulerErrorUnreachable: i18n.translate('observability.slo.wizard.rulerErrorUnreachable', {
    defaultMessage: 'Ruler is unreachable',
  }),
};

// ============================================================================
// Template selector
// ============================================================================

const CATEGORY_TITLES: Record<string, string> = {
  apm: I18N.categoryApm,
  otel: I18N.categoryOtel,
  custom: I18N.categoryCustom,
};

const CATEGORY_ORDER: ReadonlyArray<'apm' | 'otel' | 'custom'> = ['apm', 'otel', 'custom'];

const TemplateSelector: React.FC<{ onPick: (id: string) => void }> = ({ onPick }) => (
  <EuiPanel>
    <EuiText size="m">
      <h4>{I18N.pickTemplateHeading}</h4>
    </EuiText>
    <EuiText size="s" color="subdued">
      {I18N.pickTemplateDescription}
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
      { text: I18N.breadcrumbSloSli, href: '#/slos' },
      { text: I18N.breadcrumbCreate },
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
        title: I18N.toastFixValidationTitle,
        text: I18N.toastFixValidationText,
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
        title: I18N.toastCreatedTitle,
        text: I18N.toastCreatedText(doc.spec.name),
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
        // Use the OSD http-error envelope's `body.message` (richer) when
        // available; falling back to `err.message` collapses route-layer
        // 400s like "Datasource X is not registered" to "Bad Request".
        notifications.toasts.addDanger({
          title: I18N.toastCreateFailedTitle,
          text: extractServerMessage(e),
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
                    {I18N.backToSlos}
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
        <Prompt when={dirty && !createdSuccessfully && !submitting} message={I18N.unsavedPrompt} />
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
                  {I18N.changeTemplate}
                </EuiButtonEmpty>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty href="#/slos" size="s" data-test-subj="slosWizardCancel">
                  {I18N.cancel}
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
                  {I18N.createSlo}
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
                              {I18N.rulerCodeUpstreamHttpPrefix} <code>{rulerError.code}</code> ·{' '}
                              {I18N.rulerUpstreamHttp(rulerError.httpStatus)}
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
      <h4>{I18N.identityHeading(template)}</h4>
    </EuiText>
    <EuiSpacer size="s" />
    <EuiFormRow
      label={I18N.datasourceLabel}
      isInvalid={!!errors['spec.datasourceId']}
      error={errors['spec.datasourceId']}
    >
      <EuiFieldText
        value={state.datasourceId}
        onChange={(e) =>
          dispatch({ kind: 'setField', field: 'datasourceId', value: e.target.value })
        }
        data-test-subj="slosWizardDatasourceId"
        placeholder={I18N.datasourcePlaceholder}
      />
    </EuiFormRow>
    <EuiFormRow
      label={I18N.nameLabel}
      isInvalid={!!errors['spec.name']}
      error={errors['spec.name']}
    >
      <EuiFieldText
        value={state.name}
        onChange={(e) => dispatch({ kind: 'setField', field: 'name', value: e.target.value })}
        data-test-subj="slosWizardName"
      />
    </EuiFormRow>
    <EuiFormRow label={I18N.descriptionLabel}>
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
      <h4>{I18N.ownerHeading}</h4>
    </EuiText>
    <EuiSpacer size="s" />
    <EuiFormRow
      label={I18N.serviceLabel}
      isInvalid={!!errors['spec.service']}
      error={errors['spec.service']}
    >
      <EuiFieldText
        value={state.service}
        onChange={(e) => dispatch({ kind: 'setField', field: 'service', value: e.target.value })}
        data-test-subj="slosWizardService"
      />
    </EuiFormRow>
    <EuiFormRow
      label={I18N.primaryTeamLabel}
      isInvalid={!!errors['spec.owner.teams']}
      error={errors['spec.owner.teams']}
    >
      <EuiFieldText
        value={state.ownerTeam}
        onChange={(e) => dispatch({ kind: 'setField', field: 'ownerTeam', value: e.target.value })}
        data-test-subj="slosWizardOwnerTeam"
      />
    </EuiFormRow>
    <EuiFormRow label={I18N.primaryUserLabel}>
      <EuiFieldText
        value={state.ownerPrimaryUser}
        onChange={(e) =>
          dispatch({ kind: 'setField', field: 'ownerPrimaryUser', value: e.target.value })
        }
        data-test-subj="slosWizardOwnerPrimaryUser"
      />
    </EuiFormRow>
    <EuiFormRow label={I18N.tierLabel}>
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
      <h4>{I18N.sliHeading}</h4>
    </EuiText>
    <EuiSpacer size="s" />
    {template.sli.type === 'availability' && (
      <EuiFormRow
        label={I18N.goodEventsLabel}
        helpText={I18N.goodEventsHelpText(template.sli.goodEventsFilter ?? '')}
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
      label={template.sli.type === 'custom' ? I18N.dimensionsLabelOptional : I18N.dimensionsLabel}
      isInvalid={!!errors['spec.sli.dimensions']}
      error={errors['spec.sli.dimensions']}
      fullWidth
    >
      <div>
        {state.dimensions.map((dim, i) => (
          <EuiFlexGroup key={i} gutterSize="s" alignItems="flexEnd" style={{ marginBottom: 4 }}>
            <EuiFlexItem>
              <EuiFieldText
                placeholder={I18N.dimensionNamePlaceholder}
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
                placeholder={I18N.dimensionValuePlaceholder}
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
                aria-label={I18N.removeDimensionAria}
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
          {I18N.addDimension}
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
      <h4>{I18N.windowHeading}</h4>
    </EuiText>
    <EuiSpacer size="s" />
    <EuiFormRow label={I18N.rollingWindowLabel}>
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
          { value: '7d', text: I18N.window7d },
          { value: '14d', text: I18N.window14d },
          { value: '28d', text: I18N.window28d },
          { value: '30d', text: I18N.window30d },
        ]}
        data-test-subj="slosWizardWindow"
      />
    </EuiFormRow>
    {warnings['spec.window.duration'] && (
      <>
        <EuiSpacer size="s" />
        <EuiCallOut
          title={I18N.windowApproximationTitle}
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
      label={I18N.shadowModeLabel}
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
        <h4>{I18N.labelsHeading}</h4>
      </EuiText>
      <EuiText size="xs" color="subdued">
        {I18N.labelsDescriptionPrefix} <code>slo_label_&lt;key&gt;</code>
        {I18N.labelsDescriptionSuffix}
      </EuiText>
      <EuiSpacer size="s" />
      <EuiFormRow
        label={I18N.labelsLabel}
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
          addLabel={I18N.addLabel}
          keyPlaceholder={I18N.labelKeyPlaceholder}
          valuePlaceholder={I18N.labelValuePlaceholder}
        />
      </EuiFormRow>
      <EuiSpacer size="s" />
      <EuiFormRow
        label={I18N.annotationsLabel}
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
          addLabel={I18N.addAnnotation}
          keyPlaceholder={I18N.annotationKeyPlaceholder}
          valuePlaceholder={I18N.annotationValuePlaceholder}
        />
      </EuiFormRow>
    </EuiPanel>
  );
};

function rulerErrorTitle(envelope: SloRulerErrorEnvelope): string {
  switch (envelope.code) {
    case 'RULER_VALIDATION_FAILED':
      return I18N.rulerErrorValidation;
    case 'RULER_AUTH_FAILED':
      return I18N.rulerErrorAuth;
    case 'RULER_UNREACHABLE':
      return I18N.rulerErrorUnreachable;
  }
}
