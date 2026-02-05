/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor } from '@testing-library/react';
import React from 'react';
import {
  IntegrationConnectionInputs,
  IntegrationDetailsInputs,
  IntegrationQueryInputs,
  IntegrationWorkflowsInputs,
  SetupIntegrationFormInputs,
} from '../setup_integration_inputs';
import {
  TEST_INTEGRATION_CONFIG,
  TEST_INTEGRATION_SETUP_INPUTS,
} from '../../../../../test/constants';

describe('Integration Setup Inputs', () => {
  it('Renders the index form as expected', async () => {
    render(
      <SetupIntegrationFormInputs
        config={TEST_INTEGRATION_SETUP_INPUTS}
        updateConfig={() => {}}
        integration={TEST_INTEGRATION_CONFIG}
        setupCallout={{ show: false }}
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  it('Renders the S3 connector form as expected', async () => {
    render(
      <SetupIntegrationFormInputs
        config={{ ...TEST_INTEGRATION_SETUP_INPUTS, connectionType: 's3' }}
        updateConfig={() => {}}
        integration={TEST_INTEGRATION_CONFIG}
        setupCallout={{ show: false }}
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  it('Renders the S3 connector form without workflows', async () => {
    render(
      <SetupIntegrationFormInputs
        config={{ ...TEST_INTEGRATION_SETUP_INPUTS, connectionType: 's3' }}
        updateConfig={() => {}}
        integration={TEST_INTEGRATION_CONFIG}
        setupCallout={{ show: false }}
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  it('Renders the details inputs', async () => {
    render(
      <IntegrationDetailsInputs
        config={{ ...TEST_INTEGRATION_SETUP_INPUTS, connectionType: 's3' }}
        updateConfig={() => {}}
        integration={TEST_INTEGRATION_CONFIG}
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  it('Renders the connection inputs', async () => {
    render(
      <IntegrationConnectionInputs
        config={{ ...TEST_INTEGRATION_SETUP_INPUTS, connectionType: 's3' }}
        updateConfig={() => {}}
        integration={TEST_INTEGRATION_CONFIG}
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  it('Renders the connection inputs with a locked connection type', async () => {
    render(
      <IntegrationConnectionInputs
        config={{ ...TEST_INTEGRATION_SETUP_INPUTS, connectionType: 's3' }}
        updateConfig={() => {}}
        integration={TEST_INTEGRATION_CONFIG}
        lockConnectionType={true}
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  it('Renders the query inputs', async () => {
    render(
      <IntegrationQueryInputs
        config={{ ...TEST_INTEGRATION_SETUP_INPUTS, connectionType: 's3' }}
        updateConfig={() => {}}
        integration={TEST_INTEGRATION_CONFIG}
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  it('Renders the workflows inputs', async () => {
    render(
      <IntegrationWorkflowsInputs
        config={TEST_INTEGRATION_SETUP_INPUTS}
        updateConfig={() => {}}
        integration={TEST_INTEGRATION_CONFIG}
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  it('Renders the workflows inputs with conditional workflows', async () => {
    render(
      <IntegrationWorkflowsInputs
        config={{ ...TEST_INTEGRATION_SETUP_INPUTS, connectionType: 's3' }}
        updateConfig={() => {}}
        integration={{
          ...TEST_INTEGRATION_CONFIG,
          workflows: [
            {
              name: 'workflow1',
              label: 'Workflow 1',
              description: 'This is a test workflow.',
              enabled_by_default: true,
            },
            {
              name: 'workflow2',
              label: 'Workflow 2',
              description: 'This should not render.',
              enabled_by_default: true,
              applicable_data_sources: ['index'],
            },
          ],
        }}
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});
