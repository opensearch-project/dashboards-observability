## Developer Guide

So you want to contribute code to this project? Excellent! We're glad you're here. Here's what you need to do.

### Setup

1. Git clone OpenSearch-Dashboard for the version that matches the version you want to use [OpenSearch-Dashboards](https://github.com/opensearch-project/OpenSearch-Dashboards)
2. Change your node version to the version specified in `.node-version` inside the OpenSearch Dashboards root directory. (using [nvm](https://github.com/nvm-sh/nvm) can help for that)
3. Change directory into `OpenSearch-Dashboards` and git Clone the [Observability-Dashboard](https://github.com/opensearch-project/dashboards-observability) into the `plugins/` directory.
4. Run `yarn osd bootstrap` inside `OpenSearch-Dashboards`.

Ultimately, your directory structure should look like this:

```md
.
├── OpenSearch-Dashboards
│   └── plugins
│       └── dashboards-observability
```

### Build

To build the plugin's distributable zip simply run `yarn build`.

The output file : `./build/observabilityDashboards-?.?.?.zip` (`?.?.?` stands for the version number)

### Run Directly

Cd back to `OpenSearch-Dashboards` directory and run `yarn start` to start OpenSearch Dashboards including this plugin. OpenSearch Dashboards will be available on `localhost:5601`.

### Run Docker

Run `docker-compose up -d` after changing the [Dockerfile](Dockerfile) as described in this [tutorial](Using-Docker.md)

### Submitting Changes

See [CONTRIBUTING](CONTRIBUTING.md).

### Backports

The Github workflow in [`backport.yml`](.github/workflows/backport.yml) creates backport PRs automatically when the original PR
with an appropriate label `backport <backport-branch-name>` is merged to main with the backport workflow run successfully on the
PR. For example, if a PR on main needs to be backported to `1.x` branch, add a label `backport 1.x` to the PR and make sure the
backport workflow runs on the PR along with other checks. Once this PR is merged to main, the workflow will create a backport PR
to the `1.x` branch.