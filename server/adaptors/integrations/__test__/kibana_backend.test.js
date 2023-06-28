"use strict";
/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
var integrations_kibana_backend_1 = require("../integrations_kibana_backend");
describe('IntegrationsKibanaBackend', function () {
    var mockSavedObjectsClient;
    var mockRepository;
    var backend;
    beforeEach(function () {
        mockSavedObjectsClient = {
            get: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            delete: jest.fn(),
        };
        mockRepository = {
            getIntegration: jest.fn(),
            getIntegrationList: jest.fn(),
        };
        backend = new integrations_kibana_backend_1.IntegrationsKibanaBackend(mockSavedObjectsClient, mockRepository);
    });
    describe('deleteIntegrationInstance', function () {
        it('should delete the integration instance and associated assets', function () { return __awaiter(void 0, void 0, void 0, function () {
            var instanceId, asset1Id, asset2Id, instanceData, result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        instanceId = 'instance-id';
                        asset1Id = 'asset1-id';
                        asset2Id = 'asset2-id';
                        instanceData = {
                            attributes: {
                                assets: [
                                    { assetId: asset1Id, assetType: 'asset-type-1' },
                                    { assetId: asset2Id, assetType: 'asset-type-2' },
                                ],
                            },
                        };
                        mockSavedObjectsClient.get.mockResolvedValue(instanceData);
                        mockSavedObjectsClient.delete.mockResolvedValueOnce({});
                        mockSavedObjectsClient.delete.mockResolvedValueOnce({});
                        mockSavedObjectsClient.delete.mockResolvedValueOnce({});
                        return [4 /*yield*/, backend.deleteIntegrationInstance(instanceId)];
                    case 1:
                        result = _a.sent();
                        expect(mockSavedObjectsClient.get).toHaveBeenCalledWith('integration-instance', instanceId);
                        expect(mockSavedObjectsClient.delete).toHaveBeenCalledWith('asset-type-1', asset1Id);
                        expect(mockSavedObjectsClient.delete).toHaveBeenCalledWith('asset-type-2', asset2Id);
                        expect(mockSavedObjectsClient.delete).toHaveBeenCalledWith('integration-instance', instanceId);
                        expect(result).toEqual([asset1Id, asset2Id, instanceId]);
                        return [2 /*return*/];
                }
            });
        }); });
        it('should handle a 404 error when getting the integration instance', function () { return __awaiter(void 0, void 0, void 0, function () {
            var instanceId, result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        instanceId = 'instance-id';
                        mockSavedObjectsClient.get.mockRejectedValue({ output: { statusCode: 404 } });
                        return [4 /*yield*/, backend.deleteIntegrationInstance(instanceId)];
                    case 1:
                        result = _a.sent();
                        expect(mockSavedObjectsClient.get).toHaveBeenCalledWith('integration-instance', instanceId);
                        expect(result).toEqual([instanceId]);
                        return [2 /*return*/];
                }
            });
        }); });
        it('should handle a non-404 error when getting the integration instance', function () { return __awaiter(void 0, void 0, void 0, function () {
            var instanceId, error;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        instanceId = 'instance-id';
                        error = new Error('Internal Server Error');
                        mockSavedObjectsClient.get.mockRejectedValue(error);
                        return [4 /*yield*/, expect(backend.deleteIntegrationInstance(instanceId)).rejects.toThrow(error)];
                    case 1:
                        _a.sent();
                        expect(mockSavedObjectsClient.get).toHaveBeenCalledWith('integration-instance', instanceId);
                        return [2 /*return*/];
                }
            });
        }); });
        it('should handle a 404 error when deleting assets', function () { return __awaiter(void 0, void 0, void 0, function () {
            var instanceId, asset1Id, asset2Id, instanceData, result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        instanceId = 'instance-id';
                        asset1Id = 'asset1-id';
                        asset2Id = 'asset2-id';
                        instanceData = {
                            attributes: {
                                assets: [
                                    { assetId: asset1Id, assetType: 'asset-type-1' },
                                    { assetId: asset2Id, assetType: 'asset-type-2' },
                                ],
                            },
                        };
                        mockSavedObjectsClient.get.mockResolvedValue(instanceData);
                        mockSavedObjectsClient.delete.mockRejectedValueOnce({ output: { statusCode: 404 } });
                        mockSavedObjectsClient.delete.mockRejectedValueOnce({ output: { statusCode: 404 } });
                        mockSavedObjectsClient.delete.mockRejectedValueOnce({ output: { statusCode: 404 } });
                        return [4 /*yield*/, backend.deleteIntegrationInstance(instanceId)];
                    case 1:
                        result = _a.sent();
                        expect(mockSavedObjectsClient.get).toHaveBeenCalledWith('integration-instance', instanceId);
                        expect(mockSavedObjectsClient.delete).toHaveBeenCalledWith('asset-type-1', asset1Id);
                        expect(mockSavedObjectsClient.delete).toHaveBeenCalledWith('asset-type-2', asset2Id);
                        expect(mockSavedObjectsClient.delete).toHaveBeenCalledWith('integration-instance', instanceId);
                        expect(result).toEqual([asset1Id, asset2Id, instanceId]);
                        return [2 /*return*/];
                }
            });
        }); });
        it('should handle a non-404 error when deleting assets', function () { return __awaiter(void 0, void 0, void 0, function () {
            var instanceId, asset1Id, asset2Id, instanceData, error;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        instanceId = 'instance-id';
                        asset1Id = 'asset1-id';
                        asset2Id = 'asset2-id';
                        instanceData = {
                            attributes: {
                                assets: [
                                    { assetId: asset1Id, assetType: 'asset-type-1' },
                                    { assetId: asset2Id, assetType: 'asset-type-2' },
                                ],
                            },
                        };
                        error = new Error('Internal Server Error');
                        mockSavedObjectsClient.get.mockResolvedValue(instanceData);
                        mockSavedObjectsClient.delete.mockRejectedValueOnce({ output: { statusCode: 404 } });
                        mockSavedObjectsClient.delete.mockRejectedValueOnce(error);
                        return [4 /*yield*/, expect(backend.deleteIntegrationInstance(instanceId)).rejects.toThrow(error)];
                    case 1:
                        _a.sent();
                        expect(mockSavedObjectsClient.get).toHaveBeenCalledWith('integration-instance', instanceId);
                        expect(mockSavedObjectsClient.delete).toHaveBeenCalledWith('asset-type-1', asset1Id);
                        expect(mockSavedObjectsClient.delete).toHaveBeenCalledWith('asset-type-2', asset2Id);
                        expect(mockSavedObjectsClient.delete).toHaveBeenCalledWith('integration-instance', instanceId);
                        return [2 /*return*/];
                }
            });
        }); });
    });
    describe('getIntegrationTemplates', function () {
        it('should get integration templates by name', function () { return __awaiter(void 0, void 0, void 0, function () {
            var query, integration, result, _a, _b;
            var _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        query = { name: 'template1' };
                        integration = { getConfig: jest.fn().mockResolvedValue({ name: 'template1' }) };
                        mockRepository.getIntegration.mockResolvedValue(integration);
                        return [4 /*yield*/, backend.getIntegrationTemplates(query)];
                    case 1:
                        result = _d.sent();
                        expect(mockRepository.getIntegration).toHaveBeenCalledWith(query.name);
                        expect(integration.getConfig).toHaveBeenCalled();
                        _b = (_a = expect(result)).toEqual;
                        _c = {};
                        return [4 /*yield*/, integration.getConfig()];
                    case 2:
                        _b.apply(_a, [(_c.hits = [_d.sent()], _c)]);
                        return [2 /*return*/];
                }
            });
        }); });
        it('should get all integration templates', function () { return __awaiter(void 0, void 0, void 0, function () {
            var integrationList, result, _a, _b, _c;
            var _d;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        integrationList = [
                            { getConfig: jest.fn().mockResolvedValue({ name: 'template1' }) },
                            { getConfig: jest.fn().mockResolvedValue(null) },
                            { getConfig: jest.fn().mockResolvedValue({ name: 'template2' }) },
                        ];
                        mockRepository.getIntegrationList.mockResolvedValue(integrationList);
                        return [4 /*yield*/, backend.getIntegrationTemplates()];
                    case 1:
                        result = _e.sent();
                        expect(mockRepository.getIntegrationList).toHaveBeenCalled();
                        expect(integrationList[0].getConfig).toHaveBeenCalled();
                        expect(integrationList[1].getConfig).toHaveBeenCalled();
                        expect(integrationList[2].getConfig).toHaveBeenCalled();
                        _b = (_a = expect(result)).toEqual;
                        _d = {};
                        return [4 /*yield*/, integrationList[0].getConfig()];
                    case 2:
                        _c = [_e.sent()];
                        return [4 /*yield*/, integrationList[2].getConfig()];
                    case 3:
                        _b.apply(_a, [(_d.hits = _c.concat([_e.sent()]),
                                _d)]);
                        return [2 /*return*/];
                }
            });
        }); });
    });
    describe('getIntegrationInstances', function () {
        it('should get all integration instances', function () { return __awaiter(void 0, void 0, void 0, function () {
            var savedObjects, findResult, result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        savedObjects = [
                            { id: 'instance1', attributes: { name: 'instance1' } },
                            { id: 'instance2', attributes: { name: 'instance2' } },
                        ];
                        findResult = { total: savedObjects.length, saved_objects: savedObjects };
                        mockSavedObjectsClient.find.mockResolvedValue(findResult);
                        return [4 /*yield*/, backend.getIntegrationInstances()];
                    case 1:
                        result = _a.sent();
                        expect(mockSavedObjectsClient.find).toHaveBeenCalledWith({ type: 'integration-instance' });
                        expect(result).toEqual({
                            total: findResult.total,
                            hits: savedObjects.map(function (obj) { return (__assign({ id: obj.id }, obj.attributes)); }),
                        });
                        return [2 /*return*/];
                }
            });
        }); });
    });
    describe('getIntegrationInstance', function () {
        it('should get integration instance by ID', function () { return __awaiter(void 0, void 0, void 0, function () {
            var instanceId, integrationInstance, result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        instanceId = 'instance1';
                        integrationInstance = { id: instanceId, attributes: { name: 'instance1' } };
                        mockSavedObjectsClient.get.mockResolvedValue(integrationInstance);
                        return [4 /*yield*/, backend.getIntegrationInstance({ id: instanceId })];
                    case 1:
                        result = _a.sent();
                        expect(mockSavedObjectsClient.get).toHaveBeenCalledWith('integration-instance', instanceId);
                        expect(result).toEqual({ id: instanceId, status: 'available', name: 'instance1' });
                        return [2 /*return*/];
                }
            });
        }); });
    });
    describe('loadIntegrationInstance', function () {
        it('should load and create an integration instance', function () { return __awaiter(void 0, void 0, void 0, function () {
            var templateName, name, template, instanceBuilder, createdInstance, result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        templateName = 'template1';
                        name = 'instance1';
                        template = {
                            getConfig: jest.fn().mockResolvedValue({ name: templateName }),
                        };
                        instanceBuilder = {
                            build: jest.fn().mockResolvedValue({ name: name, dataset: 'nginx', namespace: 'prod' }),
                        };
                        createdInstance = { name: name, dataset: 'nginx', namespace: 'prod' };
                        mockRepository.getIntegration.mockResolvedValue(template);
                        mockSavedObjectsClient.create.mockResolvedValue({
                            result: 'created',
                        });
                        backend.instanceBuilder = instanceBuilder;
                        return [4 /*yield*/, backend.loadIntegrationInstance(templateName, name, 'datasource')];
                    case 1:
                        result = _a.sent();
                        expect(mockRepository.getIntegration).toHaveBeenCalledWith(templateName);
                        expect(instanceBuilder.build).toHaveBeenCalledWith(template, {
                            name: name,
                            dataSource: 'datasource',
                        });
                        expect(mockSavedObjectsClient.create).toHaveBeenCalledWith('integration-instance', createdInstance);
                        expect(result).toEqual(createdInstance);
                        return [2 /*return*/];
                }
            });
        }); });
        it('should reject with a 404 if template is not found', function () { return __awaiter(void 0, void 0, void 0, function () {
            var templateName;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        templateName = 'template1';
                        mockRepository.getIntegration.mockResolvedValue(null);
                        return [4 /*yield*/, expect(backend.loadIntegrationInstance(templateName, 'instance1', 'datasource')).rejects.toHaveProperty('statusCode', 404)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
        it('should reject with an error status if building fails', function () { return __awaiter(void 0, void 0, void 0, function () {
            var templateName, name, template, instanceBuilder;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        templateName = 'template1';
                        name = 'instance1';
                        template = {
                            getConfig: jest.fn().mockResolvedValue({ name: templateName }),
                        };
                        instanceBuilder = {
                            build: jest.fn().mockRejectedValue(new Error('Failed to build instance')),
                        };
                        backend.instanceBuilder = instanceBuilder;
                        mockRepository.getIntegration.mockResolvedValue(template);
                        return [4 /*yield*/, expect(backend.loadIntegrationInstance(templateName, name, 'datasource')).rejects.toHaveProperty('statusCode')];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
    });
    describe('getStatic', function () {
        it('should get static asset data', function () { return __awaiter(void 0, void 0, void 0, function () {
            var templateName, staticPath, assetData, integration, result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        templateName = 'template1';
                        staticPath = 'path/to/static';
                        assetData = Buffer.from('asset data');
                        integration = {
                            getStatic: jest.fn().mockResolvedValue(assetData),
                        };
                        mockRepository.getIntegration.mockResolvedValue(integration);
                        return [4 /*yield*/, backend.getStatic(templateName, staticPath)];
                    case 1:
                        result = _a.sent();
                        expect(mockRepository.getIntegration).toHaveBeenCalledWith(templateName);
                        expect(integration.getStatic).toHaveBeenCalledWith(staticPath);
                        expect(result).toEqual(assetData);
                        return [2 /*return*/];
                }
            });
        }); });
        it('should reject with a 404 if asset is not found', function () { return __awaiter(void 0, void 0, void 0, function () {
            var templateName, staticPath;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        templateName = 'template1';
                        staticPath = 'path/to/static';
                        mockRepository.getIntegration.mockResolvedValue(null);
                        return [4 /*yield*/, expect(backend.getStatic(templateName, staticPath)).rejects.toHaveProperty('statusCode', 404)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
    });
    describe('getAssetStatus', function () {
        it('should return "available" if all assets are available', function () { return __awaiter(void 0, void 0, void 0, function () {
            var assets, result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        assets = [
                            { assetId: 'asset1', assetType: 'type1' },
                            { assetId: 'asset2', assetType: 'type2' },
                        ];
                        return [4 /*yield*/, backend.getAssetStatus(assets)];
                    case 1:
                        result = _a.sent();
                        expect(result).toBe('available');
                        expect(mockSavedObjectsClient.get).toHaveBeenCalledTimes(2);
                        expect(mockSavedObjectsClient.get).toHaveBeenCalledWith('type1', 'asset1');
                        expect(mockSavedObjectsClient.get).toHaveBeenCalledWith('type2', 'asset2');
                        return [2 /*return*/];
                }
            });
        }); });
        it('should return "unavailable" if every asset is unavailable', function () { return __awaiter(void 0, void 0, void 0, function () {
            var assets, result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        mockSavedObjectsClient.get = jest
                            .fn()
                            .mockRejectedValueOnce({ output: { statusCode: 404 } })
                            .mockRejectedValueOnce({ output: { statusCode: 404 } })
                            .mockRejectedValueOnce({ output: { statusCode: 404 } });
                        assets = [
                            { assetId: 'asset1', assetType: 'type1' },
                            { assetId: 'asset2', assetType: 'type2' },
                            { assetId: 'asset3', assetType: 'type3' },
                        ];
                        return [4 /*yield*/, backend.getAssetStatus(assets)];
                    case 1:
                        result = _a.sent();
                        expect(result).toBe('unavailable');
                        expect(mockSavedObjectsClient.get).toHaveBeenCalledTimes(3);
                        expect(mockSavedObjectsClient.get).toHaveBeenCalledWith('type1', 'asset1');
                        expect(mockSavedObjectsClient.get).toHaveBeenCalledWith('type2', 'asset2');
                        expect(mockSavedObjectsClient.get).toHaveBeenCalledWith('type3', 'asset3');
                        return [2 /*return*/];
                }
            });
        }); });
        it('should return "partially-available" if some assets are available and some are unavailable', function () { return __awaiter(void 0, void 0, void 0, function () {
            var assets, result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        mockSavedObjectsClient.get = jest
                            .fn()
                            .mockResolvedValueOnce({}) // Available
                            .mockRejectedValueOnce({ output: { statusCode: 404 } }) // Unavailable
                            .mockResolvedValueOnce({}); // Available
                        assets = [
                            { assetId: 'asset1', assetType: 'type1' },
                            { assetId: 'asset2', assetType: 'type2' },
                            { assetId: 'asset3', assetType: 'type3' },
                        ];
                        return [4 /*yield*/, backend.getAssetStatus(assets)];
                    case 1:
                        result = _a.sent();
                        expect(result).toBe('partially-available');
                        expect(mockSavedObjectsClient.get).toHaveBeenCalledTimes(3);
                        expect(mockSavedObjectsClient.get).toHaveBeenCalledWith('type1', 'asset1');
                        expect(mockSavedObjectsClient.get).toHaveBeenCalledWith('type2', 'asset2');
                        expect(mockSavedObjectsClient.get).toHaveBeenCalledWith('type3', 'asset3');
                        return [2 /*return*/];
                }
            });
        }); });
        it('should return "unknown" if at least one asset has an unknown status', function () { return __awaiter(void 0, void 0, void 0, function () {
            var assets, result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        mockSavedObjectsClient.get = jest
                            .fn()
                            .mockResolvedValueOnce({}) // Available
                            .mockRejectedValueOnce({}) // Unknown
                            .mockResolvedValueOnce({}); // Available
                        assets = [
                            { assetId: 'asset1', assetType: 'type1' },
                            { assetId: 'asset2', assetType: 'type2' },
                            { assetId: 'asset3', assetType: 'type3' },
                        ];
                        return [4 /*yield*/, backend.getAssetStatus(assets)];
                    case 1:
                        result = _a.sent();
                        expect(result).toBe('unknown');
                        expect(mockSavedObjectsClient.get).toHaveBeenCalledTimes(3);
                        expect(mockSavedObjectsClient.get).toHaveBeenCalledWith('type1', 'asset1');
                        expect(mockSavedObjectsClient.get).toHaveBeenCalledWith('type2', 'asset2');
                        expect(mockSavedObjectsClient.get).toHaveBeenCalledWith('type3', 'asset3');
                        return [2 /*return*/];
                }
            });
        }); });
    });
});
