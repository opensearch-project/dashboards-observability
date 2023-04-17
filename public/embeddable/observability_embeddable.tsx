/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import ReactDOM from 'react-dom';
import { Subscription } from 'rxjs';
import { AttributeService } from '../../../../src/plugins/dashboard/public';
import {
  Embeddable,
  EmbeddableOutput,
  IContainer,
  SavedObjectEmbeddableInput,
} from '../../../../src/plugins/embeddable/public';
import {
  VisualizationSavedObjectAttributes,
  VISUALIZATION_SAVED_OBJECT,
} from '../../common/types/observability_saved_object_attributes';
import { ObservabilityEmbeddableComponent } from './observability_embeddable_component';

// this needs to match the saved object type for the clone and replace panel actions to work
export const OBSERVABILITY_EMBEDDABLE = VISUALIZATION_SAVED_OBJECT;
export const OBSERVABILITY_EMBEDDABLE_ID = 'observability-ppl';
export const OBSERVABILITY_EMBEDDABLE_DISPLAY_NAME = 'PPL';
export const OBSERVABILITY_EMBEDDABLE_DESCRIPTION =
  'Create a visualization with Piped Processing Language (PPL). PPL can query data in your indices and also supports federated data sources like Prometheus.';
export const OBSERVABILITY_EMBEDDABLE_ICON = 'visQueryPPL';

export interface ObservabilityOutput extends EmbeddableOutput {
  /**
   * Will contain the saved object attributes of the Observability Saved Object that matches
   * `input.savedObjectId`. If the id is invalid, this may be undefined.
   */
  attributes?: VisualizationSavedObjectAttributes;
}

type ObservabilityEmbeddableConfig = Required<
  Pick<EmbeddableOutput, 'editUrl' | 'editPath' | 'editApp'>
>;

export class ObservabilityEmbeddable extends Embeddable<
  SavedObjectEmbeddableInput,
  ObservabilityOutput
> {
  public readonly type = OBSERVABILITY_EMBEDDABLE;
  private subscription: Subscription;
  private node?: HTMLElement;
  public savedObjectId?: string;
  private attributes?: VisualizationSavedObjectAttributes;

  constructor(
    config: ObservabilityEmbeddableConfig,
    initialInput: SavedObjectEmbeddableInput,
    private attributeService: AttributeService<VisualizationSavedObjectAttributes>,
    {
      parent,
    }: {
      parent?: IContainer;
    }
  ) {
    super(initialInput, { editable: true, ...config }, parent);

    this.subscription = this.getInput$().subscribe(async () => {
      this.savedObjectId = this.getInput().savedObjectId;
      this.reload();
    });
  }

  public render(node: HTMLElement) {
    if (this.node) {
      ReactDOM.unmountComponentAtNode(this.node);
    }
    this.node = node;
    ReactDOM.render(<ObservabilityEmbeddableComponent embeddable={this} />, node);
  }

  public async reload() {
    this.attributes = await this.attributeService.unwrapAttributes(this.input);

    this.updateOutput({
      attributes: this.attributes,
      title: this.input.title || this.attributes.title,
      defaultTitle: this.attributes.title,
    });
  }

  public destroy() {
    super.destroy();
    this.subscription.unsubscribe();
    if (this.node) {
      ReactDOM.unmountComponentAtNode(this.node);
    }
  }
}
