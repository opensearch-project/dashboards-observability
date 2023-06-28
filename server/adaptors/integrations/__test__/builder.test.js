"use strict";
/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var integrations_builder_1 = require("../integrations_builder");
var mockSavedObjectsClient = {
    bulkCreate: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    find: jest.fn(),
    get: jest.fn(),
    update: jest.fn(),
};
var sampleIntegration = {
    deepCheck: jest.fn().mockResolvedValue(true),
    getAssets: jest.fn().mockResolvedValue({
        savedObjects: [
            {
                id: 'asset1',
                references: [{ id: 'ref1' }],
            },
            {
                id: 'asset2',
                references: [{ id: 'ref2' }],
            },
        ],
    }),
    getConfig: jest.fn().mockResolvedValue({
        name: 'integration-template',
        type: 'integration-type',
    }),
};
describe('IntegrationInstanceBuilder', function () {
    var builder;
    beforeEach(function () {
        builder = new integrations_builder_1.IntegrationInstanceBuilder(mockSavedObjectsClient);
    });
    afterEach(function () {
        jest.clearAllMocks();
    });
    describe('build', function () {
        it('should build an integration instance', function () { return __awaiter(void 0, void 0, void 0, function () {
            var options, remappedAssets, postAssetsResponse, expectedInstance, remapIDsSpy, postAssetsSpy, instance;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        options = {
                            dataSource: 'instance-datasource',
                            name: 'instance-name',
                        };
                        remappedAssets = [
                            {
                                id: 'remapped-asset1',
                                references: [{ id: 'remapped-ref1' }],
                            },
                            {
                                id: 'remapped-asset2',
                                references: [{ id: 'remapped-ref2' }],
                            },
                        ];
                        postAssetsResponse = {
                            saved_objects: [
                                { id: 'created-asset1', type: 'dashboard', attributes: { title: 'Dashboard 1' } },
                                { id: 'created-asset2', type: 'visualization', attributes: { title: 'Visualization 1' } },
                            ],
                        };
                        expectedInstance = {
                            name: 'instance-name',
                            templateName: 'integration-template',
                            dataSource: 'instance-datasource',
                            creationDate: expect.any(String),
                            assets: [
                                {
                                    assetType: 'dashboard',
                                    assetId: 'created-asset1',
                                    status: 'available',
                                    isDefaultAsset: true,
                                    description: 'Dashboard 1',
                                },
                                {
                                    assetType: 'visualization',
                                    assetId: 'created-asset2',
                                    status: 'available',
                                    isDefaultAsset: false,
                                    description: 'Visualization 1',
                                },
                            ],
                        };
                        // Mock the implementation of the methods in the Integration class
                        sampleIntegration.deepCheck = jest.fn().mockResolvedValue(true);
                        sampleIntegration.getAssets = jest.fn().mockResolvedValue({ savedObjects: remappedAssets });
                        sampleIntegration.getConfig = jest.fn().mockResolvedValue({
                            name: 'integration-template',
                            type: 'integration-type',
                        });
                        remapIDsSpy = jest.spyOn(builder, 'remapIDs');
                        postAssetsSpy = jest.spyOn(builder, 'postAssets');
                        mockSavedObjectsClient.bulkCreate.mockResolvedValue(postAssetsResponse);
                        return [4 /*yield*/, builder.build(sampleIntegration, options)];
                    case 1:
                        instance = _a.sent();
                        expect(sampleIntegration.deepCheck).toHaveBeenCalled();
                        expect(sampleIntegration.getAssets).toHaveBeenCalled();
                        expect(remapIDsSpy).toHaveBeenCalledWith(remappedAssets);
                        expect(postAssetsSpy).toHaveBeenCalledWith(remappedAssets);
                        expect(instance).toEqual(expectedInstance);
                        return [2 /*return*/];
                }
            });
        }); });
        it('should reject with an error if integration is not valid', function () { return __awaiter(void 0, void 0, void 0, function () {
            var options;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        options = {
                            dataSource: 'instance-datasource',
                            name: 'instance-name',
                        };
                        sampleIntegration.deepCheck = jest.fn().mockResolvedValue(false);
                        return [4 /*yield*/, expect(builder.build(sampleIntegration, options)).rejects.toThrowError('Integration is not valid')];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
        it('should reject with an error if getAssets throws an error', function () { return __awaiter(void 0, void 0, void 0, function () {
            var options, errorMessage;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        options = {
                            dataSource: 'instance-datasource',
                            name: 'instance-name',
                        };
                        errorMessage = 'Failed to get assets';
                        sampleIntegration.deepCheck = jest.fn().mockResolvedValue(true);
                        sampleIntegration.getAssets = jest.fn().mockRejectedValue(new Error(errorMessage));
                        return [4 /*yield*/, expect(builder.build(sampleIntegration, options)).rejects.toThrowError(errorMessage)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
        it('should reject with an error if postAssets throws an error', function () { return __awaiter(void 0, void 0, void 0, function () {
            var options, remappedAssets, errorMessage;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        options = {
                            dataSource: 'instance-datasource',
                            name: 'instance-name',
                        };
                        remappedAssets = [
                            {
                                id: 'remapped-asset1',
                                references: [{ id: 'remapped-ref1' }],
                            },
                        ];
                        errorMessage = 'Failed to post assets';
                        sampleIntegration.deepCheck = jest.fn().mockResolvedValue(true);
                        sampleIntegration.getAssets = jest.fn().mockResolvedValue({ savedObjects: remappedAssets });
                        builder.postAssets = jest.fn().mockRejectedValue(new Error(errorMessage));
                        return [4 /*yield*/, expect(builder.build(sampleIntegration, options)).rejects.toThrowError(errorMessage)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
        it('should reject with an error if getConfig returns null', function () { return __awaiter(void 0, void 0, void 0, function () {
            var options;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        options = {
                            dataSource: 'instance-datasource',
                            name: 'instance-name',
                        };
                        sampleIntegration.getConfig = jest.fn().mockResolvedValue(null);
                        return [4 /*yield*/, expect(builder.build(sampleIntegration, options)).rejects.toThrowError()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
    });
    describe('remapIDs', function () {
        it('should remap IDs and references in assets', function () {
            var assets = [
                {
                    id: 'asset1',
                    references: [{ id: 'ref1' }, { id: 'ref2' }],
                },
                {
                    id: 'asset2',
                    references: [{ id: 'ref1' }, { id: 'ref3' }],
                },
            ];
            var expectedRemappedAssets = [
                {
                    id: expect.any(String),
                    references: [{ id: expect.any(String) }, { id: expect.any(String) }],
                },
                {
                    id: expect.any(String),
                    references: [{ id: expect.any(String) }, { id: expect.any(String) }],
                },
            ];
            var remappedAssets = builder.remapIDs(assets);
            expect(remappedAssets).toEqual(expectedRemappedAssets);
        });
    });
    describe('postAssets', function () {
        it('should post assets and return asset references', function () { return __awaiter(void 0, void 0, void 0, function () {
            var assets, expectedRefs, bulkCreateResponse, refs;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        assets = [
                            {
                                id: 'asset1',
                                type: 'dashboard',
                                attributes: { title: 'Dashboard 1' },
                            },
                            {
                                id: 'asset2',
                                type: 'visualization',
                                attributes: { title: 'Visualization 1' },
                            },
                        ];
                        expectedRefs = [
                            {
                                assetType: 'dashboard',
                                assetId: 'created-asset1',
                                status: 'available',
                                isDefaultAsset: true,
                                description: 'Dashboard 1',
                            },
                            {
                                assetType: 'visualization',
                                assetId: 'created-asset2',
                                status: 'available',
                                isDefaultAsset: false,
                                description: 'Visualization 1',
                            },
                        ];
                        bulkCreateResponse = {
                            saved_objects: [
                                { id: 'created-asset1', type: 'dashboard', attributes: { title: 'Dashboard 1' } },
                                { id: 'created-asset2', type: 'visualization', attributes: { title: 'Visualization 1' } },
                            ],
                        };
                        mockSavedObjectsClient.bulkCreate.mockResolvedValue(bulkCreateResponse);
                        return [4 /*yield*/, builder.postAssets(assets)];
                    case 1:
                        refs = _a.sent();
                        expect(mockSavedObjectsClient.bulkCreate).toHaveBeenCalledWith(assets);
                        expect(refs).toEqual(expectedRefs);
                        return [2 /*return*/];
                }
            });
        }); });
        it('should reject with an error if bulkCreate throws an error', function () { return __awaiter(void 0, void 0, void 0, function () {
            var assets, errorMessage;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        assets = [
                            {
                                id: 'asset1',
                                type: 'dashboard',
                                attributes: { title: 'Dashboard 1' },
                            },
                        ];
                        errorMessage = 'Failed to create assets';
                        mockSavedObjectsClient.bulkCreate.mockRejectedValue(new Error(errorMessage));
                        return [4 /*yield*/, expect(builder.postAssets(assets)).rejects.toThrowError(errorMessage)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
    });
    describe('buildInstance', function () {
        it('should build an integration instance', function () { return __awaiter(void 0, void 0, void 0, function () {
            var integration, refs, options, expectedInstance, instance;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        integration = {
                            getConfig: jest.fn().mockResolvedValue({
                                name: 'integration-template',
                                type: 'integration-type',
                            }),
                        };
                        refs = [
                            {
                                assetType: 'dashboard',
                                assetId: 'created-asset1',
                                status: 'available',
                                isDefaultAsset: true,
                                description: 'Dashboard 1',
                            },
                        ];
                        options = {
                            dataSource: 'instance-datasource',
                            name: 'instance-name',
                        };
                        expectedInstance = {
                            name: 'instance-name',
                            templateName: 'integration-template',
                            dataSource: 'instance-datasource',
                            tags: undefined,
                            creationDate: expect.any(String),
                            assets: refs,
                        };
                        return [4 /*yield*/, builder.buildInstance(integration, refs, options)];
                    case 1:
                        instance = _a.sent();
                        expect(integration.getConfig).toHaveBeenCalled();
                        expect(instance).toEqual(expectedInstance);
                        return [2 /*return*/];
                }
            });
        }); });
        it('should reject with an error if getConfig returns null', function () { return __awaiter(void 0, void 0, void 0, function () {
            var integration, refs, options;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        integration = {
                            getConfig: jest.fn().mockResolvedValue(null),
                        };
                        refs = [
                            {
                                assetType: 'dashboard',
                                assetId: 'created-asset1',
                                status: 'available',
                                isDefaultAsset: true,
                                description: 'Dashboard 1',
                            },
                        ];
                        options = {
                            dataSource: 'instance-datasource',
                            name: 'instance-name',
                        };
                        return [4 /*yield*/, expect(builder.buildInstance(integration, refs, options)).rejects.toThrowError()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
    });
});
