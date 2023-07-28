/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Repository } from '../repository/repository';
import { Integration } from '../repository/integration';
import path from 'path';

describe("The local repository", () => {
    it("Should pass shallow validation for all local integrations.", async () => {
        let repository: Repository = new Repository(path.join(__dirname, '../__data__/repository'));
        let integrations: Integration[] = await repository.getIntegrationList();
        await Promise.all(integrations.map(i => expect(i.check()).resolves.toBeTruthy()));
    });

    it("Should pass deep validation for all local integrations.", async () => {
        let repository: Repository = new Repository(path.join(__dirname, '../__data__/repository'));
        let integrations: Integration[] = await repository.getIntegrationList();
        await Promise.all(integrations.map(i => expect(i.deepCheck()).resolves.toBeTruthy()));
    });
});
