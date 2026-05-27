/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * P0 SLO creation wizard — template-driven, orchestrates section components.
 * Produces a correct SloCreateInput ({ id?, spec: SloSpec }) and submits.
 *
 * State + reducer live in wizard_state.ts; state → SloCreateInput in
 * wizard_builders.ts. This file is the orchestrator + top-level layout.
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
import { i18n } from '@osd/i18n';
import { useHistory, useParams } from 'react-router-dom';
import { ChromeStart, NotificationsStart } from '../../../../../../../src/core/public';
import { HeaderControlledComponentsWrapper } from '../../../../plugin_helpers/plugin_headerControl';
import { extractRulerErrorEnvelope } from './slo_api_client';
import type { SloApiClient, SloRulerErrorEnvelope } from './slo_api_client';
import { GeneratedRulesPreview } from './generated_rules_preview';
import { ObjectivesSection } from './objectives_section';
import { CustomPromqlEditor } from './custom_promql_editor';
import { ProbeSliPanel } from './probe_sli_panel';
import { AdvancedSection } from './advanced_section';
import { ExclusionWindowsEditor } from './exclusion_windows_editor';
import type { SloCreateInput } from '../../../../../common/slo/slo_types';
import { SLO_TEMPLATES } from '../../../../../common/slo/slo_templates';
import { buildProbeQueries } from '../../../../../common/slo/slo_promql_generator';
import { validateSloSpec } from '../../../../../common/slo/slo_validators';
import { initialState, reducer } from './wizard_state';
import type { FormState } from './wizard_state';
import { buildCreateInput } from './wizard_builders';
import { WizardNav } from './wizard_nav';
import { WIZARD_SECTIONS } from './wizard_sections';
import type { WizardSectionId } from './wizard_sections';
import { WizardValidationSummary } from './wizard_validation_summary';
import { WizardKeyValueGrid } from './wizard_key_value_grid';

function sectionAnchorId(id: WizardSectionId): string {
  return WIZARD_SECTIONS.find((s) => s.id === id)!.anchorId;
}

// Offset for the sticky page header so a smooth-scroll lands the section
// title below the chrome instead of flush against it. Applied via CSS
// `scroll-margin-top` on each anchor wrapper rather than a follow-on
// scrollBy that races the in-flight smooth-scroll.
const SECTION_ANCHOR_STYLE: React.CSSProperties = { scrollMarginTop: 16 };

export interface SloWizardPageProps {
  apiClient: SloApiClient;
  chrome: ChromeStart;
  notifications: NotificationsStart;
  parentBreadcrumb: { text: string; href: string };
}

// ============================================================================
// Template selector
// ============================================================================

const CATEGORY_TITLES: Record<string, string> = {
  apm: i18n.translate('observability.apm.slo.wizard.categoryTitle.apm', {
    defaultMessage: 'APM service SLOs (span-derived)',
  }),
  otel: i18n.translate('observability.apm.slo.wizard.categoryTitle.otel', {
    defaultMessage: 'OTel semconv metrics',
  }),
  custom: i18n.translate('observability.apm.slo.wizard.categoryTitle.custom', {
    defaultMessage: 'Custom',
  }),
};

const CATEGORY_ORDER: ReadonlyArray<'apm' | 'otel' | 'custom'> = ['apm', 'otel', 'custom'];

const TemplateSelector: React.FC<{ onPick: (id: string) => void }> = ({ onPick }) => (
  <EuiPanel>
    <EuiText size="m">
      <h4>
        {i18n.translate('observability.apm.slo.wizard.templateSelector.title', {
          defaultMessage: 'Pick a template',
        })}
      </h4>
    </EuiText>
    <EuiText size="s" color="subdued">
      {i18n.translate('observability.apm.slo.wizard.templateSelector.description', {
        defaultMessage:
          'APM templates build SLIs from the span-derived RED metrics Data Prepper produces for every traced service. OTel templates target direct semconv metrics (HTTP, RPC, DB, messaging, GenAI). Custom starts from blank PromQL.',
      })}
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
  const [warnings, setWarnings] = useState<Record<string, string>>({});
  const [rulerError, setRulerError] = useState<SloRulerErrorEnvelope | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Initialize from URL template on mount.
  useEffect(() => {
    if (urlTemplateId && state.templateId !== urlTemplateId) {
      dispatch({ kind: 'setTemplate', templateId: urlTemplateId });
    }
  }, [urlTemplateId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    chrome.setBreadcrumbs([
      parentBreadcrumb,
      {
        text: i18n.translate('observability.apm.slo.wizard.breadcrumb.slos', {
          defaultMessage: 'SLO/SLI',
        }),
        href: '#/slos',
      },
      {
        text: i18n.translate('observability.apm.slo.wizard.breadcrumb.create', {
          defaultMessage: 'Create',
        }),
      },
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
  const liveWarnings = useMemo<Record<string, string>>(
    () => (liveInput ? validateSloSpec(liveInput.spec).warnings : {}),
    [liveInput]
  );
  // Probe queries — built from the first objective's spec at a 5m rate window
  // (matches the shortest recording window). The probe's lookback is a
  // horizontal-axis concern applied server-side by queryRange(); these
  // PromQL strings are what the ruler would otherwise evaluate.
  const probeQueries = useMemo<{ good: string | null; total: string | null }>(() => {
    if (!liveInput) return { good: null, total: null };
    const firstObjective = liveInput.spec.objectives[0];
    if (!firstObjective) return { good: null, total: null };
    const q = buildProbeQueries(liveInput.spec, firstObjective, '5m');
    return q ? { good: q.good, total: q.total } : { good: null, total: null };
  }, [liveInput]);
  // Live errors drive the rule-preview empty-state list — *before* the user
  // has clicked submit. Distinct from the `errors` state variable which only
  // populates after submit (and gates the top-level summary).
  const liveErrors = useMemo<Record<string, string>>(
    () => (liveInput ? validateSloSpec(liveInput.spec).errors : {}),
    [liveInput]
  );
  useEffect(() => {
    setWarnings(liveWarnings);
  }, [liveWarnings]);

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
    const { errors: specErrors, warnings: specWarnings } = validateSloSpec(input.spec);
    setWarnings(specWarnings);
    if (Object.keys(specErrors).length > 0) {
      setErrors(specErrors);
      notifications.toasts.addWarning({
        title: i18n.translate('observability.apm.slo.wizard.validationToast.title', {
          defaultMessage: 'Fix validation errors',
        }),
        text: i18n.translate('observability.apm.slo.wizard.validationToast.text', {
          defaultMessage: 'Some required fields are missing or invalid.',
        }),
      });
      return;
    }
    setErrors({});
    setRulerError(null);
    setSubmitting(true);
    try {
      const doc = await apiClient.create(input);
      notifications.toasts.addSuccess({
        title: i18n.translate('observability.apm.slo.wizard.createSuccess.title', {
          defaultMessage: 'SLO created',
        }),
        text: i18n.translate('observability.apm.slo.wizard.createSuccess.text', {
          defaultMessage: '{name} is now provisioned.',
          values: { name: doc.spec.name },
        }),
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
          title: i18n.translate('observability.apm.slo.wizard.createFailed', {
            defaultMessage: 'Failed to create SLO',
          }),
          text: err.message,
        });
      }
    } finally {
      setSubmitting(false);
    }
  }, [apiClient, history, notifications, state, template]);

  if (!template) {
    const pickActions = [
      <EuiButtonEmpty
        key="back"
        iconType="arrowLeft"
        href="#/slos"
        size="s"
        data-test-subj="slosCancel"
      >
        {i18n.translate('observability.apm.slo.wizard.backButton', {
          defaultMessage: 'Back to SLOs',
        })}
      </EuiButtonEmpty>,
    ];
    return (
      <EuiPage data-test-subj="sloWizardPage">
        <EuiPageBody component="main">
          <HeaderControlledComponentsWrapper components={pickActions} />
          <EuiPageContent color="transparent" hasBorder={false} paddingSize="none">
            <EuiPageContentBody>
              <TemplateSelector onPick={onPickTemplate} />
            </EuiPageContentBody>
          </EuiPageContent>
        </EuiPageBody>
      </EuiPage>
    );
  }

  const wizardActions = [
    <EuiButtonEmpty
      key="template-back"
      iconType="arrowLeft"
      onClick={() => history.replace('/slos/create')}
      size="s"
      data-test-subj="slosTemplateBack"
    >
      {i18n.translate('observability.apm.slo.wizard.changeTemplateButton', {
        defaultMessage: 'Change template',
      })}
    </EuiButtonEmpty>,
    <EuiButtonEmpty key="cancel" href="#/slos" size="s" data-test-subj="slosWizardCancel">
      {i18n.translate('observability.apm.slo.wizard.cancelButton', {
        defaultMessage: 'Cancel',
      })}
    </EuiButtonEmpty>,
    <EuiButton
      key="submit"
      fill
      size="s"
      isLoading={submitting}
      onClick={onSubmit}
      data-test-subj="slosWizardSubmit"
    >
      {i18n.translate('observability.apm.slo.wizard.submitButton', {
        defaultMessage: 'Create SLO',
      })}
    </EuiButton>,
  ];

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
        <HeaderControlledComponentsWrapper components={wizardActions} />
        <EuiPageContent color="transparent" hasBorder={false} paddingSize="none">
          <EuiPageContentBody>
            <EuiFlexGroup gutterSize="l" alignItems="flexStart">
              <EuiFlexItem grow={false}>
                <WizardNav errors={errors} visibleSectionIds={visibleSectionIds} />
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiForm component="form">
                  {state.submitAttempted && <WizardValidationSummary errors={errors} />}

                  <div id={sectionAnchorId('identity')} style={SECTION_ANCHOR_STYLE}>
                    <IdentityPanel
                      state={state}
                      errors={errors}
                      dispatch={dispatch}
                      template={template.name}
                    />
                  </div>

                  <EuiSpacer size="m" />

                  <div id={sectionAnchorId('window')} style={SECTION_ANCHOR_STYLE}>
                    <WindowPanel state={state} warnings={warnings} dispatch={dispatch} />
                  </div>

                  <EuiSpacer size="m" />

                  <div id={sectionAnchorId('owner')} style={SECTION_ANCHOR_STYLE}>
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

                  <div id={sectionAnchorId('sli')} style={SECTION_ANCHOR_STYLE}>
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
                      <div id={sectionAnchorId('promql')} style={SECTION_ANCHOR_STYLE}>
                        <CustomPromqlEditor
                          value={state.customPromql}
                          errors={errors}
                          dispatch={dispatch}
                        />
                      </div>
                      <EuiSpacer size="m" />
                    </>
                  )}

                  <ProbeSliPanel
                    apiClient={apiClient}
                    goodQuery={probeQueries.good}
                    totalQuery={probeQueries.total}
                    datasourceId={state.datasourceId}
                  />

                  <EuiSpacer size="m" />

                  <div id={sectionAnchorId('objectives')} style={SECTION_ANCHOR_STYLE}>
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

                  <div id={sectionAnchorId('advanced')} style={SECTION_ANCHOR_STYLE}>
                    <AdvancedSection
                      burnRates={state.burnRates}
                      budgetWarnings={state.budgetWarnings}
                      alarms={state.alarms}
                      errors={errors}
                      dispatch={dispatch}
                    />
                  </div>

                  <EuiSpacer size="m" />

                  <div id={sectionAnchorId('exclusions')} style={SECTION_ANCHOR_STYLE}>
                    <ExclusionWindowsEditor
                      exclusionWindows={state.exclusionWindows}
                      dispatch={dispatch}
                    />
                  </div>

                  <EuiSpacer size="m" />

                  <div id={sectionAnchorId('labels')} style={SECTION_ANCHOR_STYLE}>
                    <LabelsAnnotationsPanel state={state} errors={errors} dispatch={dispatch} />
                  </div>

                  <EuiSpacer size="m" />

                  <div id={sectionAnchorId('rulesPreview')} style={SECTION_ANCHOR_STYLE}>
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
                              {i18n.translate(
                                'observability.apm.slo.wizard.rulerError.codePrefix',
                                {
                                  defaultMessage: 'Code: ',
                                }
                              )}
                              <code>{rulerError.code}</code>
                              {i18n.translate(
                                'observability.apm.slo.wizard.rulerError.httpSuffix',
                                {
                                  defaultMessage: ' · upstream HTTP {status}',
                                  values: { status: rulerError.httpStatus },
                                }
                              )}
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
  dispatch: React.Dispatch<import('./wizard_state').Action>;
}

const IdentityPanel: React.FC<PanelProps & { template: string }> = ({
  state,
  errors,
  dispatch,
  template,
}) => (
  <EuiPanel>
    <EuiText size="m">
      <h4>
        {i18n.translate('observability.apm.slo.wizard.identity.heading', {
          defaultMessage: '{template} — identity',
          values: { template },
        })}
      </h4>
    </EuiText>
    <EuiSpacer size="s" />
    <EuiFormRow
      label={i18n.translate('observability.apm.slo.wizard.identity.datasourceLabel', {
        defaultMessage: 'Datasource ID',
      })}
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
    <EuiFormRow
      label={i18n.translate('observability.apm.slo.wizard.identity.nameLabel', {
        defaultMessage: 'Name',
      })}
      isInvalid={!!errors['spec.name']}
      error={errors['spec.name']}
    >
      <EuiFieldText
        value={state.name}
        onChange={(e) => dispatch({ kind: 'setField', field: 'name', value: e.target.value })}
        data-test-subj="slosWizardName"
      />
    </EuiFormRow>
    <EuiFormRow
      label={i18n.translate('observability.apm.slo.wizard.identity.descriptionLabel', {
        defaultMessage: 'Description',
      })}
    >
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
      <h4>
        {i18n.translate('observability.apm.slo.wizard.owner.heading', {
          defaultMessage: 'Service & owner',
        })}
      </h4>
    </EuiText>
    <EuiSpacer size="s" />
    <EuiFormRow
      label={i18n.translate('observability.apm.slo.wizard.owner.serviceLabel', {
        defaultMessage: 'Service',
      })}
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
      label={i18n.translate('observability.apm.slo.wizard.owner.primaryTeamLabel', {
        defaultMessage: 'Primary team',
      })}
      isInvalid={!!errors['spec.owner.teams']}
      error={errors['spec.owner.teams']}
    >
      <EuiFieldText
        value={state.ownerTeam}
        onChange={(e) => dispatch({ kind: 'setField', field: 'ownerTeam', value: e.target.value })}
        data-test-subj="slosWizardOwnerTeam"
      />
    </EuiFormRow>
    <EuiFormRow
      label={i18n.translate('observability.apm.slo.wizard.owner.primaryUserLabel', {
        defaultMessage: 'Primary user (optional)',
      })}
    >
      <EuiFieldText
        value={state.ownerPrimaryUser}
        onChange={(e) =>
          dispatch({ kind: 'setField', field: 'ownerPrimaryUser', value: e.target.value })
        }
        data-test-subj="slosWizardOwnerPrimaryUser"
      />
    </EuiFormRow>
    <EuiFormRow
      label={i18n.translate('observability.apm.slo.wizard.owner.tierLabel', {
        defaultMessage: 'Tier (optional)',
      })}
    >
      <EuiFieldText
        value={state.tier}
        onChange={(e) => dispatch({ kind: 'setField', field: 'tier', value: e.target.value })}
        data-test-subj="slosWizardTier"
      />
    </EuiFormRow>
  </EuiPanel>
);

const SliPanel: React.FC<
  PanelProps & { template: import('../../../../../common/slo/slo_templates').SloTemplate }
> = ({ state, errors, dispatch, template }) => (
  <EuiPanel>
    <EuiText size="m">
      <h4>
        {i18n.translate('observability.apm.slo.wizard.sli.heading', {
          defaultMessage: 'SLI',
        })}
      </h4>
    </EuiText>
    <EuiSpacer size="s" />
    {template.sli.type === 'availability' && (
      <EuiFormRow
        label={i18n.translate('observability.apm.slo.wizard.sli.goodEventsFilterLabel', {
          defaultMessage: 'Good events filter',
        })}
        helpText={i18n.translate('observability.apm.slo.wizard.sli.goodEventsFilterHelp', {
          defaultMessage: 'Default: {value}',
          values: { value: template.sli.goodEventsFilter ?? '' },
        })}
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
      label={
        template.sli.type === 'custom'
          ? i18n.translate('observability.apm.slo.wizard.sli.dimensionsOptionalLabel', {
              defaultMessage: 'Dimensions (optional)',
            })
          : i18n.translate('observability.apm.slo.wizard.sli.dimensionsLabel', {
              defaultMessage: 'Dimensions',
            })
      }
      isInvalid={!!errors['spec.sli.dimensions']}
      error={errors['spec.sli.dimensions']}
      fullWidth
    >
      <div>
        {state.dimensions.map((dim, i) => (
          <EuiFlexGroup
            // Stable per-row key — dim.name is the user's natural id.
            key={dim.name ? `name:${dim.name}` : `idx:${i}`}
            gutterSize="s"
            alignItems="flexEnd"
            style={{ marginBottom: 4 }}
          >
            <EuiFlexItem>
              <EuiFieldText
                placeholder={i18n.translate(
                  'observability.apm.slo.wizard.sli.dimensionNamePlaceholder',
                  { defaultMessage: 'label name' }
                )}
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
                placeholder={i18n.translate(
                  'observability.apm.slo.wizard.sli.dimensionValuePlaceholder',
                  { defaultMessage: 'label value' }
                )}
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
                aria-label={i18n.translate(
                  'observability.apm.slo.wizard.sli.removeDimensionAriaLabel',
                  { defaultMessage: 'Remove dimension' }
                )}
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
          {i18n.translate('observability.apm.slo.wizard.sli.addDimensionButton', {
            defaultMessage: 'Add dimension',
          })}
        </EuiButtonEmpty>
      </div>
    </EuiFormRow>
  </EuiPanel>
);

const WindowPanel: React.FC<{
  state: FormState;
  warnings: Record<string, string>;
  dispatch: React.Dispatch<import('./wizard_state').Action>;
}> = ({ state, warnings, dispatch }) => (
  <EuiPanel>
    <EuiText size="m">
      <h4>
        {i18n.translate('observability.apm.slo.wizard.window.heading', {
          defaultMessage: 'Window & mode',
        })}
      </h4>
    </EuiText>
    <EuiSpacer size="s" />
    <EuiFormRow
      label={i18n.translate('observability.apm.slo.wizard.window.rollingLabel', {
        defaultMessage: 'Rolling window',
      })}
    >
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
          {
            value: '7d',
            text: i18n.translate('observability.apm.slo.wizard.window.7days', {
              defaultMessage: '7 days',
            }),
          },
          {
            value: '14d',
            text: i18n.translate('observability.apm.slo.wizard.window.14days', {
              defaultMessage: '14 days',
            }),
          },
          {
            value: '28d',
            text: i18n.translate('observability.apm.slo.wizard.window.28days', {
              defaultMessage: '28 days (recommended)',
            }),
          },
          {
            value: '30d',
            text: i18n.translate('observability.apm.slo.wizard.window.30days', {
              defaultMessage: '30 days',
            }),
          },
        ]}
        data-test-subj="slosWizardWindow"
      />
    </EuiFormRow>
    {warnings['spec.window.duration'] && (
      <>
        <EuiSpacer size="s" />
        <EuiCallOut
          title={i18n.translate('observability.apm.slo.wizard.window.approximationTitle', {
            defaultMessage: 'Window approximation',
          })}
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
      label={i18n.translate('observability.apm.slo.wizard.window.shadowLabel', {
        defaultMessage: 'Shadow mode (deploy recording rules only; suppress alerts)',
      })}
      checked={state.shadow}
      onChange={(e) => dispatch({ kind: 'setField', field: 'shadow', value: e.target.checked })}
      data-test-subj="slosWizardShadow"
    />
  </EuiPanel>
);

const LabelsAnnotationsPanel: React.FC<{
  state: FormState;
  errors: Record<string, string>;
  dispatch: React.Dispatch<import('./wizard_state').Action>;
}> = ({ state, errors, dispatch }) => {
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
        <h4>
          {i18n.translate('observability.apm.slo.wizard.labels.heading', {
            defaultMessage: 'Labels & annotations (optional)',
          })}
        </h4>
      </EuiText>
      <EuiText size="xs" color="subdued">
        {i18n.translate('observability.apm.slo.wizard.labels.descriptionPrefix', {
          defaultMessage: 'Labels propagate to rules as ',
        })}
        <code>slo_label_&lt;key&gt;</code>
        {i18n.translate('observability.apm.slo.wizard.labels.descriptionSuffix', {
          defaultMessage: '. Annotations stay on the document (e.g., runbook URLs).',
        })}
      </EuiText>
      <EuiSpacer size="s" />
      <EuiFormRow
        label={i18n.translate('observability.apm.slo.wizard.labels.labelsLabel', {
          defaultMessage: 'Labels',
        })}
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
          addLabel={i18n.translate('observability.apm.slo.wizard.labels.addLabelButton', {
            defaultMessage: 'Add label',
          })}
          keyPlaceholder="compliance"
          valuePlaceholder="pci"
        />
      </EuiFormRow>
      <EuiSpacer size="s" />
      <EuiFormRow
        label={i18n.translate('observability.apm.slo.wizard.labels.annotationsLabel', {
          defaultMessage: 'Annotations',
        })}
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
          addLabel={i18n.translate('observability.apm.slo.wizard.labels.addAnnotationButton', {
            defaultMessage: 'Add annotation',
          })}
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
      return i18n.translate('observability.apm.slo.wizard.rulerError.validation', {
        defaultMessage: 'Ruler rejected the rule group',
      });
    case 'RULER_AUTH_FAILED':
      return i18n.translate('observability.apm.slo.wizard.rulerError.auth', {
        defaultMessage: 'Ruler authentication failed',
      });
    case 'RULER_UNREACHABLE':
      return i18n.translate('observability.apm.slo.wizard.rulerError.unreachable', {
        defaultMessage: 'Ruler is unreachable',
      });
  }
}
