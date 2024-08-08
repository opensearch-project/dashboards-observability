/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiAccordion,
  EuiButton,
  EuiCheckableCard,
  EuiCodeBlock,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiListGroup,
  EuiListGroupItem,
  EuiPanel,
  EuiSelectable,
  EuiSpacer,
  EuiSteps,
  EuiText,
  EuiTitle,
  EuiTabbedContent,
} from '@elastic/eui';
import React, { useEffect, useState } from 'react';

import csvFileJson from '../getting_started_artifacts/csv_file/csv_file-1.0.0.json';
import golangClientJson from '../getting_started_artifacts/golang_client/golang_client-1.0.0.json';
import otelJson from '../getting_started_artifacts/otel-services/otel-services-1.0.0.json';
import pythonJson from '../getting_started_artifacts/python_client/python_client-1.0.0.json';
import nginxJson from '../getting_started_artifacts/nginx/nginx-1.0.0.json';
import javaJson from '../getting_started_artifacts/java_client/java_client-1.0.0.json';

import { IntegrationCards } from './getting_started_integrationCards';
import { UploadAssets } from './utils';

interface CollectAndShipDataProps {
  isOpen: boolean;
  onToggle: (isOpen: boolean) => void;
  selectedTechnology: string;
  onMoveToQueryData: (indexPatterns: string[]) => void;
  onSelectSource: (source: string) => void;
  onCardSelectionChange: (isSampleDataset: boolean) => void;
  selectedDataSourceId: string;
  selectedDataSourceLabel: string;
}

interface CollectorOption {
  label: string;
  value: string;
}

export const CollectAndShipData: React.FC<CollectAndShipDataProps> = ({
  isOpen,
  onToggle,
  onMoveToQueryData,
  onSelectSource,
  onCardSelectionChange,
  selectedDataSourceId,
  selectedDataSourceLabel,
}) => {
  const [collectionMethod, setCollectionMethod] = useState('');
  const [specificMethod, setSpecificMethod] = useState('');
  const [_gettingStarted, setGettingStarted] = useState<any>(null);
  const [selectedTabId, setSelectedTabId] = useState('workflow_0');
  const [_selectedWorkflow, setSelectedWorkflow] = useState('');
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [selectedCard, setSelectedCard] = useState('');
  const [collectorOptions, setCollectorOptions] = useState<CollectorOption[]>([]);

  const technologyJsonMap: Record<string, any> = {
    otel: otelJson,
    csv: csvFileJson,
    golang: golangClientJson,
    python: pythonJson,
    nginx: nginxJson,
    java: javaJson,
  };

  useEffect(() => {
    if (specificMethod) {
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
    } else {
      setGettingStarted(null);
      setWorkflows([]);
    }
  }, [specificMethod]);

  const handleCollectionMethodChange = (value: string) => {
    setCollectionMethod(value);
    setSpecificMethod('');
    setSelectedWorkflow('');
    setGettingStarted(null);
    setWorkflows([]);
    onCardSelectionChange(value === 'Use a sample dataset');

    if (value === 'Configure collectors') {
      setCollectorOptions([
        { label: 'Open Telemetry (structured)', value: 'otel' },
        { label: 'Nginx (structured)', value: 'nginx' },
        { label: 'Java (unstructured)', value: 'java' },
        { label: 'Python (unstructured)', value: 'python' },
        { label: 'Golang (unstructured)', value: 'golang' },
      ]);
    } else if (value === 'Upload a file CSV or JSON') {
      setCollectorOptions([{ label: 'Fluent Bit', value: 'csv' }]);
    }
  };

  const handleSpecificMethodChange = (selectedOption: any) => {
    if (!selectedOption) {
      return;
    }
    const updatedOptions = collectorOptions.map((option) =>
      option.value === selectedOption.value
        ? { ...option, checked: 'on' }
        : { ...option, checked: undefined }
    );
    setCollectorOptions(updatedOptions);
    setSpecificMethod(selectedOption.value);
    onSelectSource(selectedOption.value);
    setSelectedWorkflow('');
    setGettingStarted(null);
    setWorkflows([]);
  };

  const onTabClick = (tab: any) => {
    const workflowIndex = parseInt(tab.id.split('_')[1], 10);
    setSelectedTabId(tab.id);
    setSelectedWorkflow(workflows[workflowIndex].name);
    setGettingStarted(workflows[workflowIndex]);
  };

  const renderSpecificMethodDropdown = () => {
    if (!collectionMethod) return null;

    return (
      <>
        <EuiText>
          <strong>Select a collector</strong>
        </EuiText>
        <EuiSpacer size="s" />
        <EuiSelectable
          options={collectorOptions}
          singleSelection
          onChange={(newOptions) =>
            handleSpecificMethodChange(newOptions.find((option) => option.checked))
          }
          listProps={{ bordered: true }}
        >
          {(list) => list}
        </EuiSelectable>
      </>
    );
  };

  const renderSteps = (workflow: any) => {
    const steps = workflow.steps.map((step: any) => ({
      title: step.name,
      children: (
        <div>
          {step.label && (
            <EuiText color="secondary">
              <p>{step.label}</p>
            </EuiText>
          )}
          <EuiText>{step.description}</EuiText>
          {step['input-params'] && step['input-params'].length > 0 && (
            <div>
              <EuiTitle size="xs">
                <h4>Input Parameters:</h4>
              </EuiTitle>
              {step['input-params'].map((param: any, idx: number) => (
                <EuiText key={idx}>
                  <strong>{param.name}:</strong> {param.description} ({param.type})
                </EuiText>
              ))}
            </div>
          )}
          {step.info &&
            step.info.map((link: string, linkIndex: number) => (
              <EuiLink key={linkIndex} href={link} target="_blank">
                More Info
              </EuiLink>
            ))}
          {step.content && (
            <EuiCodeBlock language="bash" fontSize="m" paddingSize="s" isCopyable>
              {step.content}
            </EuiCodeBlock>
          )}
          <EuiSpacer size="m" />
        </div>
      ),
    }));

    steps.push({
      title: 'Schema',
      children: renderSchema(
        technologyJsonMap[specificMethod]?.['getting-started']?.schema ||
          technologyJsonMap[specificMethod]?.schema ||
          []
      ),
    });

    steps.push({
      title: 'Index Patterns',
      children: renderIndex(
        technologyJsonMap[specificMethod]?.['getting-started']?.['index-patterns'] ||
          technologyJsonMap[specificMethod]?.['index-patterns'] ||
          {}
      ),
    });

    return <EuiSteps steps={steps} />;
  };

  const renderSchema = (schemas: any[]) =>
    schemas.map((schema, idx) => (
      <div key={idx}>
        <EuiTitle size="s">
          <h3>{schema.type} Schema</h3>
        </EuiTitle>
        <EuiText>
          {schema.description}
          <br />
          <strong>Alias:</strong> {schema.alias}
          <br />
          <strong>Index Pattern Name:</strong> {schema['index-pattern-name']}
          <br />
          {schema.info.map((infoLink: string, linkIdx: number) => (
            <EuiLink key={linkIdx} href={infoLink} target="_blank">
              More Info
            </EuiLink>
          ))}
        </EuiText>
        <EuiCodeBlock language="bash" fontSize="m" paddingSize="s" isCopyable>
          {schema.content}
        </EuiCodeBlock>
        <EuiLink href={schema['index-template']} target="_blank">
          Index Template
        </EuiLink>
        <EuiSpacer size="m" />
      </div>
    ));

  const renderIndex = (indexPatterns: any) => (
    <>
      <EuiText>
        {indexPatterns?.description}
        <br />
        {indexPatterns?.info?.map((infoLink: string, linkIdx: number) => (
          <EuiLink key={linkIdx} href={infoLink} target="_blank">
            More Info
          </EuiLink>
        ))}
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
          await UploadAssets(specificMethod, selectedDataSourceId, selectedDataSourceLabel);
        }}
        fill
      >
        Create assets
      </EuiButton>
      <EuiSpacer size="m" />
      <EuiButton onClick={() => onMoveToQueryData(indexPatterns?.['index-patterns-name'] || [])}>
        Move to query and analyze data
      </EuiButton>
    </>
  );

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
    <EuiAccordion
      id="collect-and-ship-data"
      buttonContent="Collect and ship data"
      paddingSize="m"
      forceState={isOpen ? 'open' : 'closed'}
      onToggle={onToggle}
    >
      <EuiPanel>
        <EuiText>
          <h3>Collect your data</h3>
        </EuiText>
        <EuiSpacer size="m" />
        <EuiText>
          <strong>Select a collection method</strong>
        </EuiText>
        <EuiSpacer size="s" />
        <EuiFlexGroup>
          <EuiFlexItem>
            <EuiCheckableCard
              id="configure_collectors"
              label="Configure collectors"
              checkableType="radio"
              checked={selectedCard === 'Configure collectors'}
              onChange={() => {
                handleCollectionMethodChange('Configure collectors');
                setSelectedCard('Configure collectors');
              }}
            >
              Configure agents and ingestion pipeline
            </EuiCheckableCard>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiCheckableCard
              id="upload_file"
              label="Upload a file CSV"
              checkableType="radio"
              checked={selectedCard === 'Upload a file CSV or JSON'}
              onChange={() => {
                handleCollectionMethodChange('Upload a file CSV or JSON');
                setSelectedCard('Upload a file CSV or JSON');
              }}
            >
              Upload your data
            </EuiCheckableCard>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiCheckableCard
              id="use_sample_dataset"
              label="Use a sample dataset"
              checkableType="radio"
              checked={selectedCard === 'Use a sample dataset'}
              onChange={() => {
                handleCollectionMethodChange('Use a sample dataset');
                setSelectedCard('Use a sample dataset');
              }}
            >
              Explore with a log dataset
            </EuiCheckableCard>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="m" />
        {collectionMethod === 'Use a sample dataset' ? (
          <IntegrationCards />
        ) : (
          <>
            {renderSpecificMethodDropdown()}
            <EuiSpacer size="s" />
            {specificMethod && (
              <>
                <EuiSpacer size="s" />
                {tabs.length > 0 && (
                  <EuiTabbedContent
                    tabs={tabs}
                    selectedTab={tabs.find((tab) => tab.id === selectedTabId)}
                    onTabClick={onTabClick}
                  />
                )}
              </>
            )}
          </>
        )}
      </EuiPanel>
    </EuiAccordion>
  );
};
