# Integration Configuration

**Date:** March 22, 2024

The bulk of an integration's functionality is defined in its config. Let's look a bit at the config
for the current [Nginx integration](https://github.com/opensearch-project/dashboards-observability/blob/4e1e0e585/server/adaptors/integrations/__data__/repository/nginx/nginx-1.0.0.json),
with some fields pruned for legibility, to get a better understanding of what information it
contains.

```json5
{
  "name": "nginx",
  "version": "1.0.0",
  "workflows": [
    {
      "name": "queries"
    },
    {
      "name": "dashboards"
    }
  ],
  "components": [
    {
      "name": "communication",
      "version": "1.0.0"
    },
    {
      "name": "http",
      "version": "1.0.0"
    },
    {
      "name": "logs",
      "version": "1.0.0"
    }
  ],
  "assets": [
    {
      "name": "nginx",
      "version": "1.0.0",
      "extension": "ndjson",
      "type": "savedObjectBundle",
      "workflows": ["dashboards"]
    },
    {
      "name": "create_table",
      "version": "1.0.0",
      "extension": "sql",
      "type": "query"
    },
    {
      "name": "create_mv",
      "version": "1.0.0",
      "extension": "sql",
      "type": "query",
      "workflows": ["dashboards"]
    }
  ],
  "sampleData": {
    "path": "sample.json"
  }
}
```

There are generally four key components to an integration's functionality, a lot of what's left is metadata or used for rendering.

- `assets` are the items that are associated with the integration, including queries, dashboards,
  and index patterns. Originally the assets were just one `ndjson` file of exported Saved Objects
  (today a `savedObjectBundle`), but to support further options it was transformed to a list with
  further types. The assets are available under the [directory of the same name](https://github.com/opensearch-project/dashboards-observability/tree/4e1e0e585/server/adaptors/integrations/__data__/repository/nginx/assets).
  The currently supported asset types are:
  - `savedObjectBundle`: a saved object export. This typically includes an index pattern and a dashboard querying it, and it indicates that the integration expects data that conforms to this index pattern (see `components` below). Saved objects that link to each other by URL need to declare those links; see [Links between saved objects](#links-between-saved-objects).
  - `query`: A SQL query that is sent to OpenSearch Spark. You can read more about it at the
    [opensearch-spark repository](https://github.com/opensearch-project/opensearch-spark/blob/main/docs/index.md).
- `workflows` are conditional flags that toggle whether or not an asset should be installed. They're
  selected by the user before installing the integration. By default, an asset is included under
  every workflow. Currently, workflows are only enabled for integrations that support S3 data source
  installations, and workflows are run in order of type (`query`s are always run before `savedObjectBundle`s).
- `components` define the format of the data expected for saved queries and dashboards. This format
  is specified by the components. These are typically shared between related integrations to allow
  things like correlation by field. The current standard components defined here and in the
  [OpenSearch Catalog](https://github.com/opensearch-project/opensearch-catalog) are heavily
  inspired by [OpenTelemetry](https://opentelemetry.io/). The components can be used for validation
  when connecting an integration to an index pattern. It's highly recommended to reuse existing
  components where possible.
- `sampleData` is loaded after the rest of the integration setup process when users select the "Try it" option.

## Links between saved objects

When an integration is installed, every saved object in its `savedObjectBundle` gets a new ID, and
the IDs in each object's `references` are updated to match. A saved object can also link to another
saved object through a URL in one of its attributes, for example a markdown panel or a data link
that opens `/app/dashboards#/view/<id>`. These URLs are only updated if the object declares each
link target in its `references` with a name that starts with `link_`:

```json
{
  "id": "overview-dashboard",
  "type": "dashboard",
  "attributes": {
    "title": "Overview",
    "description": "[Open details](/app/dashboards#/view/details-dashboard)"
  },
  "references": [{ "name": "link_0", "type": "dashboard", "id": "details-dashboard" }]
}
```

On install, `/view/<id>` and `/edit/<id>` in the object's string attributes, including nested and
JSON-encoded ones, are rewritten to the new ID when `<id>` is the ID of one of its `link_<n>`
references. The URL ends up with the same ID as the reference. Objects without `link_*` references
are installed as-is, and IDs in other parts of a URL or in plain text are never changed. Use
`link_0`, `link_1`, and so on for each linked object, and set `type` to the linked object's type.

Some things to keep in mind:

- Only links to objects in the same bundle are rewritten. A `link_*` reference to an object that
  isn't part of the bundle, such as a dashboard from another integration, keeps its ID in both the
  reference and the URL.
- The ID must appear in the URL as-is. A URL-encoded ID (for example `%20` for a space) isn't
  matched, which doesn't matter for UUIDs and IDs made of letters, digits, `-`, and `_`.
- Editing and saving an installed object in OpenSearch Dashboards can rebuild its `references`
  without the `link_*` entries (dashboards do). The installed links keep working, but an export of the edited
  object no longer declares them. Keep the `link_*` references in the integration's own
  `savedObjectBundle` rather than re-exporting them from an installed instance.
