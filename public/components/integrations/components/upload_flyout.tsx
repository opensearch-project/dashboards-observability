/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiSmallButton,
  EuiCompressedFilePicker,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiForm,
  EuiCompressedFormRow,
} from '@elastic/eui';
import React, { useEffect, useState } from 'react';
import { useToast } from '../../../../public/components/common/toast';
import { coreRefs } from '../../../../public/framework/core_refs';

export const uploadBundle = async (bundle: File | null): Promise<Error | null> => {
  if (!bundle) {
    return new Error('No bundle selected');
  }

  const formData = new FormData();
  formData.append('file', bundle);
  try {
    const response = await coreRefs.http?.post('/api/saved_objects/_import', {
      headers: {
        // Important to leave undefined, it forces proper headers to be set for FormData
        'Content-Type': undefined,
      },
      body: formData,
      query: {
        overwrite: true,
        // If we don't disable this, we'll get 413 Content Too Large errors for many bundles
        dataSourceEnabled: false,
      },
    });

    console.log(response);
    if (response.success) {
      return null;
    } else {
      return new Error(response.body.message);
    }
  } catch (err) {
    return err;
  }
};

const checkBundle = async (bundle: File | null): Promise<boolean> => {
  if (bundle == null) {
    return false;
  }
  if (!/.*\.ndjson&/i.test(bundle.name) && bundle.type !== 'application/x-ndjson') {
    return false;
  }

  try {
    const contents = await bundle.text();
    const objects = contents
      .trim()
      .split('\n')
      .map((s) => JSON.parse(s));
    return objects.every((obj) => !obj.type || obj.type === 'integration-template');
  } catch (err) {
    return false;
  }
};

export const IntegrationUploadPicker = ({
  onFileSelected,
  isInvalid,
  setIsInvalid,
}: {
  onFileSelected: (file: File | null) => void;
  isInvalid: boolean;
  setIsInvalid: (value: boolean) => void;
}) => {
  const [blurred, setBlurred] = useState(false);
  const [checkCompleted, setCheckCompleted] = useState(false);
  const [bundle, setBundle] = useState(null as File | null);

  useEffect(() => {
    const refreshValidity = async () => {
      if (!blurred) {
        return;
      }
      const valid = await checkBundle(bundle);
      setIsInvalid(!valid);
      setCheckCompleted(true);
    };
    setCheckCompleted(false);
    refreshValidity();
    // It's important that we update *only* on the bundle changing here, so we don't report errors
    // early when the file picker is still open and get error flickering on the UI in the happy path.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle]);

  const handleFileChange = (files: FileList | null) => {
    if (files && files.length > 0) {
      setBundle(files[0]);
      onFileSelected(files[0]);
    } else {
      setBundle(null);
      onFileSelected(null);
    }
  };

  return (
    <EuiForm>
      <EuiCompressedFormRow
        label="Select file"
        isInvalid={checkCompleted && isInvalid}
        error={['Must be an ndjson bundle of integration templates']}
      >
        <EuiCompressedFilePicker
          id="integrationBundlePicker"
          initialPromptText="Select or drag and drop integration bundles"
          onChange={handleFileChange}
          isInvalid={checkCompleted && isInvalid}
          onBlur={() => setBlurred(true)}
        />
      </EuiCompressedFormRow>
    </EuiForm>
  );
};

export const IntegrationUploadFlyout = ({ onClose }: { onClose: () => void }) => {
  const [bundle, setBundle] = useState(null as File | null);
  const { setToast } = useToast();
  const [isInvalid, setIsInvalid] = useState(true);

  return (
    <EuiFlyout onClose={onClose} size="s">
      <EuiFlyoutHeader>Upload Integrations</EuiFlyoutHeader>
      <EuiFlyoutBody>
        <IntegrationUploadPicker
          onFileSelected={setBundle}
          isInvalid={isInvalid}
          setIsInvalid={setIsInvalid}
        />
      </EuiFlyoutBody>
      <EuiFlyoutFooter>
        <EuiFlexGroup justifyContent="spaceBetween">
          <EuiFlexItem grow={false}>
            <EuiSmallButton onClick={onClose}>Cancel</EuiSmallButton>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiSmallButton
              fill
              disabled={isInvalid}
              onClick={async () => {
                const err = await uploadBundle(bundle);
                if (err == null) {
                  setToast('Successfully uploaded bundle', 'success');
                  onClose();
                } else {
                  setToast('Error uploading bundle', 'danger', err.message ?? '');
                }
              }}
            >
              Upload
            </EuiSmallButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </EuiFlyout>
  );
};
