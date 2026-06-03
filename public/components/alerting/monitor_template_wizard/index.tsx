/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Monitor Template Wizard — auto-generates monitors for common OTEL /
 * Prometheus applications. Scans the discovered metric catalog, groups by
 * application category, and offers preconfigured alert rules that follow
 * OTEL semantic conventions.
 *
 * Despite the previous `AiMonitorWizard` name, this is a static template
 * picker — it matches observed metrics against a hand-written `alert_templates.ts`
 * catalog. Renamed per reviewer feedback (Comment 14).
 *
 * Sub-files in this folder:
 *   - `alert_templates.ts`  — AlertTemplate / ApplicationCategory + APPLICATION_CATALOG
 *   - `metric_discovery.ts` — discoverApplications + countAvailableTemplates
 *   - `severity_helpers.ts` — SEVERITY_ORDER
 *
 * Re-exports `AlertTemplate` so existing consumers that imported it from
 * `'./ai_monitor_wizard'` (now `'./monitor_template_wizard'`) continue to
 * work with just a path change.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  EuiBadge,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiCheckbox,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiFormRow,
  EuiHorizontalRule,
  EuiIcon,
  EuiLoadingSpinner,
  EuiPanel,
  EuiProgress,
  EuiSelect,
  EuiSpacer,
  EuiText,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { FormattedMessage } from '@osd/i18n/react';
import { MOCK_METRICS } from '../promql_editor';
import { UnifiedAlertSeverity } from '../../../../common/types/alerting';
import { SEVERITY_COLORS } from '../shared_constants';
import { AlertTemplate, ApplicationCategory } from './alert_templates';
import { countAvailableTemplates, discoverApplications } from './metric_discovery';
import { SEVERITY_ORDER } from './severity_helpers';

// Re-export the shared template type so existing consumers keep working
// after the path change from `./ai_monitor_wizard` to `./monitor_template_wizard`.
export type { AlertTemplate, ApplicationCategory } from './alert_templates';

// ============================================================================
// Wizard Steps
// ============================================================================

type WizardStep = 'scanning' | 'review' | 'configure' | 'summary';

export interface MonitorTemplateWizardProps {
  onClose: () => void;
  onCreateMonitors: (monitors: AlertTemplate[]) => void;
}

export const MonitorTemplateWizard: React.FC<MonitorTemplateWizardProps> = ({
  onClose,
  onCreateMonitors,
}) => {
  const [step, setStep] = useState<WizardStep>('scanning');
  const [scanProgress, setScanProgress] = useState(0);
  const [applications, setApplications] = useState<ApplicationCategory[]>([]);
  const [selectedTemplates, setSelectedTemplates] = useState<Set<string>>(new Set());
  const [severityOverrides, setSeverityOverrides] = useState<Record<string, UnifiedAlertSeverity>>(
    {}
  );
  const [labelPrefix, setLabelPrefix] = useState('');

  // Simulate scanning
  useEffect(() => {
    if (step !== 'scanning') return;
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 25 + 10;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        const discovered = discoverApplications(MOCK_METRICS);
        setApplications(discovered);
        // Pre-select all available templates
        const allIds = new Set<string>();
        discovered.forEach((cat) => {
          cat.templates.forEach((t) => {
            if (t.requiredMetrics.every((rm) => cat.discoveredMetrics.includes(rm))) {
              allIds.add(t.id);
            }
          });
        });
        setSelectedTemplates(allIds);
        setTimeout(() => setStep('review'), 400);
      }
      setScanProgress(Math.min(progress, 100));
    }, 300);
    return () => clearInterval(interval);
  }, [step]);

  const totalDiscoveredMetrics = useMemo(
    () => applications.reduce((sum, a) => sum + a.discoveredMetrics.length, 0),
    [applications]
  );

  const totalAvailableAlerts = useMemo(
    () => applications.reduce((sum, a) => sum + countAvailableTemplates(a).available, 0),
    [applications]
  );

  const toggleTemplate = (id: string) => {
    setSelectedTemplates((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleCategory = (cat: ApplicationCategory, selectAll: boolean) => {
    setSelectedTemplates((prev) => {
      const next = new Set(prev);
      cat.templates.forEach((t) => {
        if (t.requiredMetrics.every((rm) => cat.discoveredMetrics.includes(rm))) {
          if (selectAll) next.add(t.id);
          else next.delete(t.id);
        }
      });
      return next;
    });
  };

  const isCategoryFullySelected = (cat: ApplicationCategory) =>
    cat.templates
      .filter((t) => t.requiredMetrics.every((rm) => cat.discoveredMetrics.includes(rm)))
      .every((t) => selectedTemplates.has(t.id));

  const isCategoryPartiallySelected = (cat: ApplicationCategory) => {
    const available = cat.templates.filter((t) =>
      t.requiredMetrics.every((rm) => cat.discoveredMetrics.includes(rm))
    );
    const selected = available.filter((t) => selectedTemplates.has(t.id));
    return selected.length > 0 && selected.length < available.length;
  };

  const handleCreate = () => {
    const monitors: AlertTemplate[] = [];
    applications.forEach((cat) => {
      cat.templates.forEach((t) => {
        if (selectedTemplates.has(t.id)) {
          const override = severityOverrides[t.id];
          const finalTemplate = override
            ? { ...t, severity: override, labels: { ...t.labels, severity: override } }
            : t;
          if (labelPrefix) {
            finalTemplate.labels = {
              ...finalTemplate.labels,
              monitor_source: 'ai-wizard',
              prefix: labelPrefix,
            };
          } else {
            finalTemplate.labels = { ...finalTemplate.labels, monitor_source: 'ai-wizard' };
          }
          monitors.push(finalTemplate);
        }
      });
    });
    onCreateMonitors(monitors);
  };

  // ---- Render helpers ----

  const renderScanning = () => (
    <div style={{ textAlign: 'center', padding: '40px 20px' }}>
      <EuiLoadingSpinner size="xl" />
      <EuiSpacer size="l" />
      <EuiTitle size="s">
        <h3>
          <FormattedMessage
            id="observability.alerting.monitorTemplateWizard.scanningTitle"
            defaultMessage="Scanning Prometheus Metrics"
          />
        </h3>
      </EuiTitle>
      <EuiSpacer size="s" />
      <EuiText size="s" color="subdued">
        <FormattedMessage
          id="observability.alerting.monitorTemplateWizard.scanningDescription"
          defaultMessage="Discovering OTEL-compatible metrics and matching against known application patterns..."
        />
      </EuiText>
      <EuiSpacer size="l" />
      <EuiProgress value={scanProgress} max={100} size="l" color="primary" />
      <EuiSpacer size="s" />
      <EuiText size="xs" color="subdued">
        <FormattedMessage
          id="observability.alerting.monitorTemplateWizard.scanningProgress"
          defaultMessage="{progress}% — Analyzing metric namespaces"
          values={{ progress: Math.round(scanProgress) }}
        />
      </EuiText>
    </div>
  );

  const renderReview = () => (
    <div>
      <EuiCallOut
        title={i18n.translate(
          'observability.alerting.monitorTemplateWizard.discoveryCompleteTitle',
          {
            defaultMessage: 'Metrics Discovery Complete',
          }
        )}
        color="success"
        iconType="check"
        size="s"
      >
        <EuiText size="xs">
          <FormattedMessage
            id="observability.alerting.monitorTemplateWizard.discoveryCompleteBody"
            defaultMessage="Found {metrics} across {categories}. {alerts} are available based on your metrics."
            values={{
              metrics: (
                <strong>
                  <FormattedMessage
                    id="observability.alerting.monitorTemplateWizard.metricsCount"
                    defaultMessage="{count} metrics"
                    values={{ count: totalDiscoveredMetrics }}
                  />
                </strong>
              ),
              categories: (
                <strong>
                  <FormattedMessage
                    id="observability.alerting.monitorTemplateWizard.categoriesCount"
                    defaultMessage="{count} application categories"
                    values={{ count: applications.length }}
                  />
                </strong>
              ),
              alerts: (
                <strong>
                  <FormattedMessage
                    id="observability.alerting.monitorTemplateWizard.alertsCount"
                    defaultMessage="{count} preconfigured alerts"
                    values={{ count: totalAvailableAlerts }}
                  />
                </strong>
              ),
            }}
          />
        </EuiText>
      </EuiCallOut>
      <EuiSpacer size="m" />

      {applications.map((cat) => {
        const { available, total } = countAvailableTemplates(cat);
        const fullySelected = isCategoryFullySelected(cat);
        const partiallySelected = isCategoryPartiallySelected(cat);

        return (
          <div key={cat.id} style={{ marginBottom: 12 }}>
            <EuiPanel paddingSize="m" hasBorder>
              <EuiFlexGroup alignItems="center" responsive={false} gutterSize="s">
                <EuiFlexItem grow={false}>
                  <EuiCheckbox
                    id={`cat-${cat.id}`}
                    checked={fullySelected}
                    indeterminate={partiallySelected}
                    onChange={() => toggleCategory(cat, !fullySelected)}
                    aria-label={i18n.translate(
                      'observability.alerting.monitorTemplateWizard.selectAllInCategoryAriaLabel',
                      {
                        defaultMessage: 'Select all {category} alerts',
                        values: { category: cat.name },
                      }
                    )}
                  />
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiIcon type={cat.icon} size="l" color={cat.color} />
                </EuiFlexItem>
                <EuiFlexItem>
                  <EuiText size="s">
                    <strong>{cat.name}</strong>
                  </EuiText>
                  <EuiText size="xs" color="subdued">
                    {cat.description}
                  </EuiText>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiFlexGroup gutterSize="xs" responsive={false}>
                    <EuiFlexItem grow={false}>
                      <EuiBadge color="hollow">
                        <FormattedMessage
                          id="observability.alerting.monitorTemplateWizard.metricsBadge"
                          defaultMessage="{count} metrics"
                          values={{ count: cat.discoveredMetrics.length }}
                        />
                      </EuiBadge>
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiBadge color={available === total ? 'success' : 'warning'}>
                        <FormattedMessage
                          id="observability.alerting.monitorTemplateWizard.alertsReadyBadge"
                          defaultMessage="{available}/{total} alerts ready"
                          values={{ available, total }}
                        />
                      </EuiBadge>
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiToolTip
                        content={i18n.translate(
                          'observability.alerting.monitorTemplateWizard.otelNamespaceTooltip',
                          {
                            defaultMessage: 'OTEL namespace: {namespace}',
                            values: { namespace: cat.otelNamespace },
                          }
                        )}
                      >
                        <EuiBadge color="primary">OTEL</EuiBadge>
                      </EuiToolTip>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </EuiFlexItem>
              </EuiFlexGroup>

              <EuiSpacer size="s" />

              {/* Discovered metrics preview */}
              <EuiFlexGroup gutterSize="xs" wrap responsive={false} style={{ marginBottom: 8 }}>
                {cat.discoveredMetrics.slice(0, 6).map((m) => (
                  <EuiFlexItem grow={false} key={m}>
                    <EuiBadge color="hollow" style={{ fontSize: 10 }}>
                      {m}
                    </EuiBadge>
                  </EuiFlexItem>
                ))}
                {cat.discoveredMetrics.length > 6 && (
                  <EuiFlexItem grow={false}>
                    <EuiText size="xs" color="subdued">
                      <FormattedMessage
                        id="observability.alerting.monitorTemplateWizard.moreMetrics"
                        defaultMessage="+{count} more"
                        values={{ count: cat.discoveredMetrics.length - 6 }}
                      />
                    </EuiText>
                  </EuiFlexItem>
                )}
              </EuiFlexGroup>

              <EuiHorizontalRule margin="xs" />

              {/* Alert templates */}
              {cat.templates.map((t) => {
                const metricsAvailable = t.requiredMetrics.every((rm) =>
                  cat.discoveredMetrics.includes(rm)
                );
                const missingMetrics = t.requiredMetrics.filter(
                  (rm) => !cat.discoveredMetrics.includes(rm)
                );

                return (
                  <EuiFlexGroup
                    key={t.id}
                    alignItems="center"
                    responsive={false}
                    gutterSize="s"
                    style={{ padding: '4px 0', opacity: metricsAvailable ? 1 : 0.5 }}
                  >
                    <EuiFlexItem grow={false}>
                      <EuiCheckbox
                        id={`tmpl-${t.id}`}
                        checked={selectedTemplates.has(t.id)}
                        onChange={() => toggleTemplate(t.id)}
                        disabled={!metricsAvailable}
                        aria-label={i18n.translate(
                          'observability.alerting.monitorTemplateWizard.selectTemplateAriaLabel',
                          {
                            defaultMessage: 'Select {name}',
                            values: { name: t.name },
                          }
                        )}
                      />
                    </EuiFlexItem>
                    <EuiFlexItem>
                      <EuiText size="xs">
                        <strong>{t.name}</strong>
                      </EuiText>
                      <EuiText size="xs" color="subdued">
                        {t.description}
                      </EuiText>
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiBadge color={SEVERITY_COLORS[t.severity]}>{t.severity}</EuiBadge>
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiToolTip
                        content={i18n.translate(
                          'observability.alerting.monitorTemplateWizard.queryTooltip',
                          {
                            defaultMessage: 'Query: {query} {condition}',
                            values: { query: t.query, condition: t.condition },
                          }
                        )}
                      >
                        <EuiBadge color="hollow" style={{ fontSize: 10 }}>
                          <FormattedMessage
                            id="observability.alerting.monitorTemplateWizard.conditionForDuration"
                            defaultMessage="{condition} for {duration}"
                            values={{ condition: t.condition, duration: t.forDuration }}
                          />
                        </EuiBadge>
                      </EuiToolTip>
                    </EuiFlexItem>
                    {!metricsAvailable && (
                      <EuiFlexItem grow={false}>
                        <EuiToolTip
                          content={i18n.translate(
                            'observability.alerting.monitorTemplateWizard.missingMetricsTooltip',
                            {
                              defaultMessage: 'Missing: {metrics}',
                              values: { metrics: missingMetrics.join(', ') },
                            }
                          )}
                        >
                          <EuiBadge color="danger">
                            <FormattedMessage
                              id="observability.alerting.monitorTemplateWizard.missingMetricsBadge"
                              defaultMessage="missing metrics"
                            />
                          </EuiBadge>
                        </EuiToolTip>
                      </EuiFlexItem>
                    )}
                  </EuiFlexGroup>
                );
              })}
            </EuiPanel>
          </div>
        );
      })}
    </div>
  );

  const renderConfigure = () => {
    const selectedList = applications
      .flatMap((cat) =>
        cat.templates
          .filter((t) => selectedTemplates.has(t.id))
          .map((t) => ({ ...t, category: cat.name }))
      )
      .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 4) - (SEVERITY_ORDER[b.severity] ?? 4));

    return (
      <div>
        <EuiCallOut
          title={i18n.translate(
            'observability.alerting.monitorTemplateWizard.monitorsSelectedTitle',
            {
              defaultMessage: '{count} rules selected',
              values: { count: selectedList.length },
            }
          )}
          color="primary"
          iconType="check"
          size="s"
        >
          <EuiText size="xs">
            <FormattedMessage
              id="observability.alerting.monitorTemplateWizard.configureBody"
              defaultMessage="Review and customize severity levels before creating. You can also add a label prefix to group these monitors."
            />
          </EuiText>
        </EuiCallOut>
        <EuiSpacer size="m" />

        <EuiFormRow
          label={i18n.translate('observability.alerting.monitorTemplateWizard.labelPrefixLabel', {
            defaultMessage: 'Label Prefix (optional)',
          })}
          helpText={i18n.translate(
            'observability.alerting.monitorTemplateWizard.labelPrefixHelpText',
            {
              defaultMessage: 'Added as a label to all generated rules for easy filtering',
            }
          )}
        >
          <EuiFieldText
            placeholder={i18n.translate(
              'observability.alerting.monitorTemplateWizard.labelPrefixPlaceholder',
              {
                defaultMessage: 'e.g. my-team, production',
              }
            )}
            value={labelPrefix}
            onChange={(e) => setLabelPrefix(e.target.value)}
            compressed
            aria-label={i18n.translate(
              'observability.alerting.monitorTemplateWizard.labelPrefixAriaLabel',
              {
                defaultMessage: 'Label prefix',
              }
            )}
          />
        </EuiFormRow>

        <EuiSpacer size="m" />

        <EuiPanel paddingSize="s" color="subdued">
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {selectedList.map((t) => (
              <EuiFlexGroup
                key={t.id}
                alignItems="center"
                responsive={false}
                gutterSize="s"
                style={{ padding: '6px 4px', borderBottom: '1px solid #eee' }}
              >
                <EuiFlexItem>
                  <EuiText size="xs">
                    <strong>{t.name}</strong>
                  </EuiText>
                  <EuiText size="xs" color="subdued">
                    {t.category}
                  </EuiText>
                </EuiFlexItem>
                <EuiFlexItem grow={false} style={{ width: 130 }}>
                  <EuiSelect
                    options={[
                      {
                        value: 'critical',
                        text: i18n.translate(
                          'observability.alerting.monitorTemplateWizard.severityOption.critical',
                          { defaultMessage: 'Critical' }
                        ),
                      },
                      {
                        value: 'high',
                        text: i18n.translate(
                          'observability.alerting.monitorTemplateWizard.severityOption.high',
                          { defaultMessage: 'High' }
                        ),
                      },
                      {
                        value: 'medium',
                        text: i18n.translate(
                          'observability.alerting.monitorTemplateWizard.severityOption.medium',
                          { defaultMessage: 'Medium' }
                        ),
                      },
                      {
                        value: 'low',
                        text: i18n.translate(
                          'observability.alerting.monitorTemplateWizard.severityOption.low',
                          { defaultMessage: 'Low' }
                        ),
                      },
                      {
                        value: 'info',
                        text: i18n.translate(
                          'observability.alerting.monitorTemplateWizard.severityOption.info',
                          { defaultMessage: 'Info' }
                        ),
                      },
                    ]}
                    value={severityOverrides[t.id] || t.severity}
                    onChange={(e) =>
                      setSeverityOverrides((prev) => ({
                        ...prev,
                        [t.id]: e.target.value as UnifiedAlertSeverity,
                      }))
                    }
                    compressed
                    aria-label={i18n.translate(
                      'observability.alerting.monitorTemplateWizard.severityForAriaLabel',
                      {
                        defaultMessage: 'Severity for {name}',
                        values: { name: t.name },
                      }
                    )}
                  />
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiToolTip content={`${t.query} ${t.condition}`}>
                    <EuiIcon type="inspect" />
                  </EuiToolTip>
                </EuiFlexItem>
              </EuiFlexGroup>
            ))}
          </div>
        </EuiPanel>
      </div>
    );
  };

  const renderSummary = () => {
    const count = selectedTemplates.size;
    const bySeverity: Record<string, number> = {};
    applications.forEach((cat) => {
      cat.templates.forEach((t) => {
        if (selectedTemplates.has(t.id)) {
          const sev = severityOverrides[t.id] || t.severity;
          bySeverity[sev] = (bySeverity[sev] || 0) + 1;
        }
      });
    });

    return (
      <div style={{ textAlign: 'center', padding: '20px' }}>
        <EuiIcon type="check" size="xxl" color="success" />
        <EuiSpacer size="m" />
        <EuiTitle size="m">
          <h2>
            <FormattedMessage
              id="observability.alerting.monitorTemplateWizard.summaryTitle"
              defaultMessage="{count} Monitors Created"
              values={{ count }}
            />
          </h2>
        </EuiTitle>
        <EuiSpacer size="s" />
        <EuiText size="s" color="subdued">
          <FormattedMessage
            id="observability.alerting.monitorTemplateWizard.summaryDescription"
            defaultMessage="All monitors have been created and are now active. They will begin evaluating on their configured intervals."
          />
        </EuiText>
        <EuiSpacer size="m" />
        <EuiFlexGroup justifyContent="center" gutterSize="s" wrap>
          {Object.entries(bySeverity)
            .sort((a, b) => (SEVERITY_ORDER[a[0]] ?? 4) - (SEVERITY_ORDER[b[0]] ?? 4))
            .map(([sev, n]) => (
              <EuiFlexItem grow={false} key={sev}>
                <EuiBadge color={SEVERITY_COLORS[sev]}>
                  {n} {sev}
                </EuiBadge>
              </EuiFlexItem>
            ))}
        </EuiFlexGroup>
        {labelPrefix && (
          <>
            <EuiSpacer size="s" />
            <EuiText size="xs" color="subdued">
              <FormattedMessage
                id="observability.alerting.monitorTemplateWizard.labeledWith"
                defaultMessage="All monitors labeled with {prefixBadge} and {sourceBadge}"
                values={{
                  prefixBadge: <EuiBadge color="hollow">prefix:{labelPrefix}</EuiBadge>,
                  sourceBadge: <EuiBadge color="hollow">monitor_source:ai-wizard</EuiBadge>,
                }}
              />
            </EuiText>
          </>
        )}
      </div>
    );
  };

  // ---- Step navigation ----

  const canGoNext = () => {
    if (step === 'review') return selectedTemplates.size > 0;
    if (step === 'configure') return selectedTemplates.size > 0;
    return false;
  };

  const handleNext = () => {
    if (step === 'review') setStep('configure');
    else if (step === 'configure') {
      handleCreate();
      setStep('summary');
    }
  };

  const handleBack = () => {
    if (step === 'configure') setStep('review');
  };

  const stepContent = () => {
    switch (step) {
      case 'scanning':
        return renderScanning();
      case 'review':
        return renderReview();
      case 'configure':
        return renderConfigure();
      case 'summary':
        return renderSummary();
    }
  };

  const stepTitle = () => {
    switch (step) {
      case 'scanning':
        return i18n.translate('observability.alerting.monitorTemplateWizard.step.scanning', {
          defaultMessage: 'Scanning Metrics',
        });
      case 'review':
        return i18n.translate('observability.alerting.monitorTemplateWizard.step.review', {
          defaultMessage: 'Select rules',
        });
      case 'configure':
        return i18n.translate('observability.alerting.monitorTemplateWizard.step.configure', {
          defaultMessage: 'Configure',
        });
      case 'summary':
        return i18n.translate('observability.alerting.monitorTemplateWizard.step.summary', {
          defaultMessage: 'Complete',
        });
    }
  };

  const stepNumber = () => {
    switch (step) {
      case 'scanning':
        return 1;
      case 'review':
        return 2;
      case 'configure':
        return 3;
      case 'summary':
        return 4;
    }
  };

  return (
    <EuiFlyout onClose={onClose} size="l" ownFocus aria-labelledby="monitorTemplateWizardTitle">
      <EuiFlyoutHeader hasBorder>
        <EuiFlexGroup alignItems="center" responsive={false} gutterSize="m">
          <EuiFlexItem grow={false}>
            <EuiIcon type="sparkles" size="l" color="primary" />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiTitle size="m">
              <h2 id="monitorTemplateWizardTitle">
                <FormattedMessage
                  id="observability.alerting.monitorTemplateWizard.headerTitle"
                  defaultMessage="Monitor Template Setup"
                />
              </h2>
            </EuiTitle>
            <EuiText size="xs" color="subdued">
              <FormattedMessage
                id="observability.alerting.monitorTemplateWizard.headerSubtitle"
                defaultMessage="Auto-generate monitors from discovered OTEL metrics — Step {step} of 4: {title}"
                values={{ step: stepNumber(), title: stepTitle() }}
              />
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            {step !== 'scanning' && step !== 'summary' && (
              <EuiBadge color="primary">
                <FormattedMessage
                  id="observability.alerting.monitorTemplateWizard.selectedBadge"
                  defaultMessage="{count} selected"
                  values={{ count: selectedTemplates.size }}
                />
              </EuiBadge>
            )}
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutHeader>

      <EuiFlyoutBody>{stepContent()}</EuiFlyoutBody>

      <EuiFlyoutFooter>
        <EuiFlexGroup justifyContent="spaceBetween" responsive={false}>
          <EuiFlexItem grow={false}>
            {step === 'summary' ? (
              <EuiButton onClick={onClose}>
                <FormattedMessage
                  id="observability.alerting.monitorTemplateWizard.doneButton"
                  defaultMessage="Done"
                />
              </EuiButton>
            ) : (
              <EuiButtonEmpty onClick={onClose}>
                <FormattedMessage
                  id="observability.alerting.monitorTemplateWizard.cancelButton"
                  defaultMessage="Cancel"
                />
              </EuiButtonEmpty>
            )}
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiFlexGroup gutterSize="s" responsive={false}>
              {step === 'configure' && (
                <EuiFlexItem grow={false}>
                  <EuiButtonEmpty onClick={handleBack}>
                    <FormattedMessage
                      id="observability.alerting.monitorTemplateWizard.backButton"
                      defaultMessage="Back"
                    />
                  </EuiButtonEmpty>
                </EuiFlexItem>
              )}
              {step !== 'scanning' && step !== 'summary' && (
                <EuiFlexItem grow={false}>
                  <EuiButton fill onClick={handleNext} isDisabled={!canGoNext()}>
                    {step === 'configure'
                      ? i18n.translate(
                          'observability.alerting.monitorTemplateWizard.createMonitorsButton',
                          {
                            defaultMessage: 'Create {count} rules',
                            values: { count: selectedTemplates.size },
                          }
                        )
                      : i18n.translate(
                          'observability.alerting.monitorTemplateWizard.nextConfigureButton',
                          {
                            defaultMessage: 'Next: Configure',
                          }
                        )}
                  </EuiButton>
                </EuiFlexItem>
              )}
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </EuiFlyout>
  );
};
