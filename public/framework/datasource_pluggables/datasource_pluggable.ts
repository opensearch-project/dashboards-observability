/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { IDataSourceComponentSet, IDataSourcePluggableComponents } from './types';

export class DataSourcePluggable {
  private components: IDataSourcePluggableComponents = {};

  public addVariationSet(
    variationKey: string,
    variationValue: string,
    componentSet: IDataSourceComponentSet
  ) {
    if (!this.components[variationKey]) {
      this.components[variationKey] = {};
    }
    this.components[variationKey][variationValue] = componentSet;
    return this;
  }

  public getComponentSetForVariation(
    variationKey: string,
    variationValue: string
  ): IDataSourceComponentSet | undefined {
    return this.components[variationKey]?.[variationValue];
  }
}
