/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiCheckableCard,
  EuiCodeBlock,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiListGroup,
  EuiListGroupItem,
  EuiPanel,
  EuiSpacer,
  EuiSteps,
  EuiText,
  EuiTitle,
  EuiTabbedContent,
  EuiCompressedComboBox,
  EuiButton,
  EuiIcon,
  EuiCard,
  EuiSelectableOption,
} from '@elastic/eui';
import React, { useEffect, useState } from 'react';

import golangClientJson from '../getting_started_artifacts/golang_client/golang_client-1.0.0.json';
import golangIcon from '../getting_started_artifacts/golang_client/static/logo.svg';
import otelJsonLogs from '../getting_started_artifacts/otel-services/otel-services-1.0.0-logs.json';
import otelJsonMetrics from '../getting_started_artifacts/otel-services/otel-services-1.0.0-metrics.json';
import otelJsonTraces from '../getting_started_artifacts/otel-services/otel-services-1.0.0-traces.json';
import otelIcon from '../getting_started_artifacts/otel-services/static/logo.svg';
import pythonJson from '../getting_started_artifacts/python_client/python_client-1.0.0.json';
import pythonIcon from '../getting_started_artifacts/python_client/static/logo.png';
import nginxJson from '../getting_started_artifacts/nginx/nginx-1.0.0.json';
import nginxIcon from '../getting_started_artifacts/nginx/static/logo.svg';
import javaJson from '../getting_started_artifacts/java_client/java_client-1.0.0.json';
import javaIcon from '../getting_started_artifacts/java_client/static/logo.svg';

import { coreRefs } from '../../../../public/framework/core_refs';
import { UploadAssets, fetchIndexPatternIds, redirectToDashboards } from './utils';
import { getWorkspaceIdFromUrl } from '../../../../../../src/core/public/utils';

const cardOne = 'Logs';
const cardTwo = 'Metrics';
const cardThree = 'Traces';

interface CollectAndShipDataProps {
  isOpen: boolean;
  onToggle: (isOpen: boolean) => void;
  selectedDataSourceId: string;
  selectedDataSourceLabel: string;
}

export interface CollectorOption {
  label: string;
  value: string;
}

export const CollectAndShipData: React.FC<CollectAndShipDataProps> = ({
  selectedDataSourceId,
  selectedDataSourceLabel,
}) => {
  const [collectionMethod, setCollectionMethod] = useState('');
  const [specificMethod, setSpecificMethod] = useState('');
  const [_gettingStarted, setGettingStarted] = useState<any>(null);
  const [selectedTabId, setSelectedTabId] = useState('workflow_0');
  const [_selectedWorkflow, setSelectedWorkflow] = useState('');
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [collectorOptions, setCollectorOptions] = useState<CollectorOption[]>([]);
  const [patternsContent, setPatternsContent] = useState<any[]>([]);

  const getTelemetryOption = (collectionMethodOtel: string) => {
    switch (collectionMethodOtel) {
      case cardTwo:
        return { label: 'Open Telemetry', value: 'otelMetrics' };
      case cardThree:
        return { label: 'Open Telemetry', value: 'otelTraces' };
      default:
        return { label: 'Open Telemetry', value: 'otelLogs' };
    }
  };

  const [selectedIntegration, setSelectedIntegration] = useState<
    Array<EuiSelectableOption<CollectorOption>>
  >([getTelemetryOption(cardOne)]);

  const technologyJsonMap: Record<string, any> = {
    otelLogs: otelJsonLogs,
    otelMetrics: otelJsonMetrics,
    otelTraces: otelJsonTraces,
    golang: golangClientJson,
    python: pythonJson,
    nginx: nginxJson,
    java: javaJson,
  };

  useEffect(() => {
    handleCollectionMethodChange(cardOne);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const fetchPatterns = async () => {
      try {
        const content = await fetchIndexPatternIds(specificMethod);
        if (isMounted) {
          setPatternsContent(content.data.length !== 0 ? content.data : []);
        }
      } catch (error) {
        console.error('Error fetching index patterns:', error);
        if (isMounted) setPatternsContent([]);
      }
    };

    if (specificMethod && isMounted) {
      fetchPatterns();

      const json = technologyJsonMap[specificMethod];
      if (json && json['getting-started']) {
        const fetchedWorkflows = json['getting-started'].workflows || [];
        setWorkflows(fetchedWorkflows);
        if (fetchedWorkflows.length > 0) {
          setSelectedWorkflow(fetchedWorkflows[0].name);
          setSelectedTabId(`workflow_0`);
          setGettingStarted(fetchedWorkflows[0]);
        }
      } else {
        setGettingStarted(null);
        setWorkflows([]);
      }
    }

    return () => {
      isMounted = false;
    };
  }, [specificMethod]);

  const handleSpecificMethodChange = (newOption: Array<EuiSelectableOption<CollectorOption>>) => {
    const selectedOptionValue = newOption[0]?.value;

    if (selectedOptionValue === specificMethod) {
      return;
    }

    setSelectedIntegration(newOption);
    setSpecificMethod(selectedOptionValue);
    setSelectedWorkflow('');
    setGettingStarted(null);
    setWorkflows([]);
  };

  // Auto-select first collector if nothing is selected and a collection method is set
  useEffect(() => {
    if (collectorOptions.length > 0 && !specificMethod && collectionMethod) {
      const telemetryOption = getTelemetryOption(collectionMethod);
      handleSpecificMethodChange([{ ...telemetryOption }]);
    }
  }, [collectorOptions, specificMethod, collectionMethod]);

  const handleCollectionMethodChange = (value: string) => {
    setCollectionMethod(value);
    setSpecificMethod('');
    setSelectedWorkflow('');
    setGettingStarted(null);
    setWorkflows([]);

    if (value === cardOne) {
      setCollectorOptions([
        getTelemetryOption(cardOne),
        { label: 'Nginx', value: 'nginx' },
        { label: 'Java', value: 'java' },
        { label: 'Python', value: 'python' },
        { label: 'Golang', value: 'golang' },
      ]);
    } else if (value === cardTwo) {
      setCollectorOptions([getTelemetryOption(cardTwo)]);
    } else if (value === cardThree) {
      setCollectorOptions([getTelemetryOption(cardThree)]);
    }

    setSelectedIntegration([getTelemetryOption(value)]);
  };

  const renderSpecificMethodDropdown = () => {
    if (!collectionMethod) return null;

    const iconMap: Record<string, string> = {
      golang: golangIcon,
      otelLogs: otelIcon,
      otelMetrics: otelIcon,
      otelTraces: otelIcon,
      python: pythonIcon,
      nginx: nginxIcon,
      java: javaIcon,
    };

    const optionsWithIcons = collectorOptions.map((option) => ({
      label: option.label,
      value: option.value,
      prepend: (
        <img
          src={iconMap[option.value]}
          alt={`${option.label} icon`}
          className="synopsisIconSmall"
        />
      ),
    }));

    const selectedOption = optionsWithIcons.find((option) => option.value === specificMethod);

    return (
      <>
        <EuiSpacer size="s" />
        <EuiText size="s">Select telemetry source</EuiText>
        <div style={{ maxWidth: '400px' }}>
          <EuiCompressedComboBox
            singleSelection={{ asPlainText: true }}
            options={optionsWithIcons}
            selectedOptions={selectedOption ? [selectedOption] : []}
            onChange={(newOptions) =>
              handleSpecificMethodChange(newOptions as Array<EuiSelectableOption<CollectorOption>>)
            }
            renderOption={(option) => (
              <div style={{ display: 'flex', alignItems: 'center' }}>
                {option.prepend}
                {option.label}
              </div>
            )}
          />
        </div>
      </>
    );
  };

  const renderIndexPatternStep = (
    patternsContentRender: any[],
    selectedDataSourceIdRender: string
  ) => {
    if (!patternsContentRender || patternsContentRender.length === 0) return null;

    const handleIndexPatternClick = (patternId: string) => {
      const finalPatternId = selectedDataSourceIdRender
        ? `mds-${selectedDataSourceIdRender}-objectId-${patternId}`
        : patternId;

      const currentUrl = window.location.href;
      const workspaceId = getWorkspaceIdFromUrl(currentUrl, coreRefs?.http!.basePath.getBasePath());

      const workspacePatternId = workspaceId
        ? `workspaceId-${workspaceId}-${finalPatternId}`
        : finalPatternId;

      coreRefs?.application!.navigateToApp('data-explorer', {
        path: `discover#?_a=(discover:(columns:!(_source),isDirty:!f,sort:!()),metadata:(indexPattern:'${workspacePatternId}',view:discover))&_q=(filters:!(),query:(language:kuery,query:''))&_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-15m,to:now))`,
      });
    };

    return (
      <>
        <EuiText>
          <p>Query your data in Discover to uncover insights</p>
        </EuiText>
        <EuiSpacer size="s" />
        <EuiListGroup flush>
          {patternsContentRender.map((pattern) => (
            <EuiListGroupItem
              key={pattern.id}
              label={
                <EuiLink
                  onClick={() => handleIndexPatternClick(pattern.id)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                >
                  {pattern.title}
                  <EuiIcon type="popout" aria-label="Open in Discover" />
                </EuiLink>
              }
            />
          ))}
        </EuiListGroup>
      </>
    );
  };

  const renderSchema = (schemas: any[]) =>
    schemas.map((schema, idx) => {
      const indexPatternName = schema['index-pattern-name'] || '';

      return (
        <div key={idx}>
          <EuiTitle size="s">
            <h3>{schema.type} Schema</h3>
          </EuiTitle>
          <EuiText>
            {schema.description}
            <br />
            {schema.alias && (
              <>
                <strong>Alias:</strong> {schema.alias}
                <br />
              </>
            )}
            {indexPatternName && (
              <>
                <strong>Index Pattern Name:</strong> {indexPatternName}
                <br />
              </>
            )}
            {Array.isArray(schema.info) &&
              schema.info.map((link: any, linkIdx: number) =>
                link && typeof link.url === 'string' ? (
                  <EuiLink key={linkIdx} href={link.url} target="_blank">
                    {typeof link.title === 'string' && link.title.trim() !== ''
                      ? link.title
                      : 'More Info'}
                  </EuiLink>
                ) : (
                  <EuiText color="danger" key={linkIdx}>
                    Invalid URL
                  </EuiText>
                )
              )}
          </EuiText>
          {schema.content && (
            <EuiCodeBlock language="bash" fontSize="m" paddingSize="s" isCopyable>
              {schema.content}
            </EuiCodeBlock>
          )}
          {schema['index-template'] && (
            <EuiLink href={schema['index-template']} target="_blank">
              {`${indexPatternName} Index Template`}
            </EuiLink>
          )}
          <EuiSpacer size="m" />
        </div>
      );
    });

  const renderIndex = (indexPatterns: any) => (
    <>
      <EuiText>
        {indexPatterns?.description}
        <br />
        {Array.isArray(indexPatterns?.info) &&
          indexPatterns.info.map((link: any, linkIdx: number) =>
            link && typeof link.url === 'string' ? (
              <EuiLink key={linkIdx} href={link.url} target="_blank">
                {typeof link.title === 'string' && link.title.trim() !== ''
                  ? link.title
                  : 'More Info'}
              </EuiLink>
            ) : (
              <EuiText color="danger" key={linkIdx}>
                Invalid URL
              </EuiText>
            )
          )}
      </EuiText>
      <EuiSpacer size="m" />
      <EuiTitle size="s">
        <h3>Index Patterns</h3>
      </EuiTitle>
      <EuiListGroup>
        {indexPatterns?.['index-patterns-name']?.map((pattern: string, idx: number) => (
          <EuiListGroupItem key={idx} label={pattern} />
        ))}
      </EuiListGroup>
      <EuiButton
        onClick={async () => {
          await UploadAssets(
            specificMethod,
            selectedDataSourceId,
            selectedDataSourceLabel,
            technologyJsonMap[specificMethod]?.['getting-started']?.schema ||
              technologyJsonMap[specificMethod]?.schema ||
              [],
            selectedIntegration
          );
        }}
        fill
      >
        Create assets
      </EuiButton>
    </>
  );

  const renderTechnologyDashboardCards = (specificMethodRender: string) => {
    const baseUrl = `${window.location.origin}/app`;

    const cardData = {
      nginx: {
        title: 'Nginx Dashboard',
        description: 'Analyze logs with pre-packaged dashboards',
        icon: <img src={nginxIcon} alt="Nginx Icon" className="synopsisIcon" />,
        url: `${baseUrl}/integrations#/available/nginx/setup`,
      },
    };

    const selectedCard = cardData[specificMethodRender];

    if (!selectedCard) return null;

    return (
      <EuiFlexItem style={{ maxWidth: '300px' }}>
        <EuiCard
          icon={selectedCard.icon}
          title={selectedCard.title}
          description={selectedCard.description}
          footer={
            <EuiButton iconType="popout" onClick={() => window.open(selectedCard.url, '_blank')}>
              Install from Catalog
            </EuiButton>
          }
        />
      </EuiFlexItem>
    );
  };

  const renderVisualizeDataStep = () => {
    return (
      <EuiFlexGroup>
        {renderTechnologyDashboardCards(specificMethod)}

        <EuiFlexItem style={{ maxWidth: '300px' }}>
          <EuiCard
            icon={<EuiIcon type="dashboardApp" size="xxl" />}
            title="Create a new dashboard"
            description="Create a new dashboard to visualize your data"
            footer={
              <EuiButton iconType="plusInCircle" onClick={() => redirectToDashboards('dashboards')}>
                Create a dashboard
              </EuiButton>
            }
          />
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  };

  const renderSteps = (workflow: any) => {
    const steps = [
      {
        title: 'Schema',
        children: renderSchema(
          technologyJsonMap[specificMethod]?.['getting-started']?.schema ||
            technologyJsonMap[specificMethod]?.schema ||
            []
        ),
      },
      {
        title: 'Index Patterns',
        children: renderIndex(
          technologyJsonMap[specificMethod]?.['getting-started']?.['index-patterns'] ||
            technologyJsonMap[specificMethod]?.['index-patterns'] ||
            {}
        ),
      },
    ];

    steps.push(
      ...workflow.steps.map((step: any) => ({
        title: step.name,
        children: (
          <div>
            <EuiText>{step.description}</EuiText>
            {step['input-params'] && step['input-params'].length > 0 && (
              <div>
                <EuiTitle size="xs">
                  <h4>Input Parameters:</h4>
                </EuiTitle>
                {step['input-params'].map((param: any, idx: number) => (
                  <EuiText key={idx}>
                    <strong>{param.name}:</strong> {param.description}
                  </EuiText>
                ))}
              </div>
            )}

            {Array.isArray(step.info) &&
              step.info.map((link: any, linkIndex: number) => {
                if (link && typeof link.url === 'string') {
                  return (
                    <EuiLink key={linkIndex} href={link.url} target="_blank">
                      {typeof link.title === 'string' && link.title.trim() !== ''
                        ? link.title
                        : 'More Info'}
                    </EuiLink>
                  );
                } else {
                  return (
                    <EuiText color="danger" key={linkIndex}>
                      Invalid URL
                    </EuiText>
                  );
                }
              })}

            {step.content && (
              <EuiCodeBlock language="bash" fontSize="m" paddingSize="s" isCopyable>
                {step.content}
              </EuiCodeBlock>
            )}
            <EuiSpacer size="m" />
          </div>
        ),
      }))
    );

    steps.push({
      title: 'Explore your data',
      children: renderIndexPatternStep(patternsContent, selectedDataSourceId),
    });

    steps.push({
      title: 'Visualize your data',
      children: renderVisualizeDataStep(),
    });

    return <EuiSteps steps={steps} />;
  };

  const tabs = workflows.map((workflow, index) => ({
    id: `workflow_${index}`,
    name: workflow.name,
    content: (
      <div>
        <EuiSpacer size="l" />
        {renderSteps(workflow)}
      </div>
    ),
  }));

  return (
    <EuiPanel paddingSize="m">
      <EuiSpacer size="s" />
      <EuiFlexGroup>
        <EuiFlexItem>
          <EuiCheckableCard
            id="getting_started_logs"
            label={cardOne}
            checkableType="radio"
            checked={collectionMethod === cardOne}
            onChange={() => {
              handleCollectionMethodChange(cardOne);
            }}
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiCheckableCard
            id="getting_started_metrics"
            label={cardTwo}
            checkableType="radio"
            checked={collectionMethod === cardTwo}
            onChange={() => {
              handleCollectionMethodChange(cardTwo);
            }}
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiCheckableCard
            id="getting_started_traces"
            label={cardThree}
            checkableType="radio"
            checked={collectionMethod === cardThree}
            onChange={() => {
              handleCollectionMethodChange(cardThree);
            }}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="m" />
      {renderSpecificMethodDropdown()}
      <EuiSpacer size="s" />
      {specificMethod && (
        <>
          <EuiSpacer size="s" />
          {tabs.length > 0 && (
            <>
              <EuiTitle size="s">
                <h3>
                  Steps to integrate{' '}
                  {specificMethod.startsWith('otel')
                    ? 'OpenTelemetry'
                    : specificMethod.charAt(0).toUpperCase() + specificMethod.slice(1)}{' '}
                  {collectionMethod.toLowerCase()}
                </h3>
              </EuiTitle>
              <EuiTabbedContent
                tabs={tabs}
                selectedTab={tabs.find((tab) => tab.id === selectedTabId)}
                onTabClick={(tab) => setSelectedTabId(tab.id)}
              />
            </>
          )}
        </>
      )}
    </EuiPanel>
  );
};
