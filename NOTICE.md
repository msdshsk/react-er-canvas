# NOTICE

`@msdshsk/react-er-canvas` is distributed under the **MIT License** (see [LICENSE](./LICENSE)).

It uses the following third-party libraries, each governed by its own license. Full license texts are distributed with each dependency's npm package.

## Direct dependencies

These libraries are installed alongside this package when consumers run `npm install @msdshsk/react-er-canvas`. They are referenced as `external` modules in the bundled output (`dist/`), so no portion of their source code is embedded in this project's distributed artifacts.

| Library | Version | License | Copyright |
|---|---|---|---|
| [`chevrotain`](https://github.com/Chevrotain/chevrotain) | `^12.0.0` | [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0) | Copyright (c) Shahar Soel and contributors |
| [`elkjs`](https://github.com/kieler/elkjs) | `^0.11.1` | [EPL-2.0](https://www.eclipse.org/legal/epl-2.0/) | Copyright (c) Eclipse Layout Kernel contributors |

### chevrotain — Apache License 2.0

Used as an unmodified runtime dependency for ER-syntax parsing. Apache-2.0 permits incorporation into MIT-licensed works provided that the original license and any NOTICE files are preserved with redistribution. The chevrotain npm package ships its full Apache-2.0 license text alongside its source, satisfying this requirement under standard npm distribution.

### elkjs — Eclipse Public License 2.0

Used as an unmodified runtime dependency for diagram layout computation. Under EPL-2.0:

- This project does **not** modify, fork, or otherwise alter `elkjs` source code.
- This project does **not** bundle `elkjs` into its compiled output. The Vite library configuration explicitly excludes `elkjs` (and any subpaths matching `/^elkjs(\/.*)?$/`) from the build via `rollupOptions.external`.
- Consumers receive `elkjs` through the standard npm dependency mechanism, with the EPL-2.0 license text preserved in the upstream package.

If you fork this project and modify `elkjs` or bundle its source into a redistributable artifact (e.g., a single-file CDN build or an Electron `asar` package), additional EPL-2.0 obligations apply — including making the modified `elkjs` source available under EPL-2.0.

## Peer dependencies

Consumers must provide these themselves; they are not installed by this package.

| Library | Range | License |
|---|---|---|
| [`@xyflow/react`](https://github.com/xyflow/xyflow) | `>=12 <13` | MIT |
| [`react`](https://github.com/facebook/react) | `^18.2.0 \|\| ^19.0.0` | MIT |
| [`react-dom`](https://github.com/facebook/react) | `^18.2.0 \|\| ^19.0.0` | MIT |

All peer dependencies are MIT-licensed and impose no additional attribution requirements on this project.

## Compliance summary

- All dependency licenses (MIT, Apache-2.0, EPL-2.0) are compatible with MIT redistribution under this project's standard usage pattern (unmodified, externalized, npm-distributed).
- No third-party source code is embedded in `dist/`.
- License texts and copyright notices for each dependency travel with their respective npm packages.

If you redistribute this library in a form that bundles its dependencies — for example, a browser CDN build, a single-file bundle, or an Electron application packaged via `asar` — you should include the relevant license texts directly. For unmodified npm-installed usage, the npm distribution mechanism satisfies attribution requirements.
