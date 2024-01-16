# Integration Catalogs

## Formats

In order to bundle configuration into an integration, we encode an integration's assets using a specific format.
Multiple formats are supported, defined by [Catalog Readers](../../../server/adaptors/integrations/repository/catalog_data_adaptor.ts).
At the time of writing, there are two:

- **File System:** This is the format used for the [bundled integrations in source](../../../server/adaptors/integrations/__data__/repository).
  Integrations are organized into directories where each directory has configs that link to further assets.
- **Json:** This is the format which is used for storing integrations in indices internally.
  The format is similar to the File System config format, except all external assets are encoded within one Json object.
  This can be uploaded directly, but is less convenient than the upcoming Zip format.

An important property of a format is whether the config is localized or not.
A localized config means that assets are stored directly in the config, such as with Json.
A non-localized config involves multiple reads to get all config data, such as with File System or Zip.
This is set in the `isConfigLocalized` parameter in every supported reader,
and is used by the higher-level IntegrationReader to configure how the integration is read.

## Uploading

When an Index reader is implemented, uploading will be possible by sending an encoded Catalog to the `/api/integrations/upload` endpoint.
The request format is:

```json5
// POST /api/integrations/upload
{
    "format": "json", // Upcoming: "zip"
    "encoding": "text", // Or "base64". For binary formats like "zip", must be base64.
    "data": "[encoded string]" // Encoded with the specified encoding.
}
```
