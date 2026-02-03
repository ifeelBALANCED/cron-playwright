# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

## E2E Testing with Playwright

This project includes a comprehensive E2E testing setup with Playwright, including automatic deployment of HTML test reports to GitHub Pages.

### Quick Start

```bash
# Install dependencies
pnpm install

# Install Playwright browsers
pnpm exec playwright install --with-deps

# Run all E2E tests
pnpm test:e2e

# Run specific test suites
pnpm test:e2e:smoke      # Smoke tests only
pnpm test:e2e:regression # Regression tests only

# Interactive mode
pnpm test:e2e:ui         # UI mode
pnpm test:e2e:headed     # Headed mode
pnpm test:e2e:debug      # Debug mode

# View last report
pnpm report:show
```

### Report URLs

After CI runs, reports are available at:

- **Reports Index**: `https://<owner>.github.io/<repo>/reports/`
- **PR Reports**: `https://<owner>.github.io/<repo>/reports/pr/<PR_NUMBER>/<RUN_ID>/<JOB>/`
- **Scheduled Reports**: `https://<owner>.github.io/<repo>/reports/scheduled/<ENV>/<DATE>/<RUN_ID>/<SUITE>/`

### CI/CD Workflows

| Workflow | Trigger | Description |
|----------|---------|-------------|
| `e2e-pr.yml` | Pull requests | Runs 5 browser tests, deploys reports, posts PR comment |
| `e2e-scheduled.yml` | Daily cron | Runs stage/prod tests, deploys reports |
| `setup-pages.yml` | Manual | One-time setup for gh-pages branch |

### Initial Setup

1. **Initialize GitHub Pages**:
   ```bash
   gh workflow run setup-pages.yml
   ```

2. **Configure Pages** in repository settings:
   - Go to Settings → Pages
   - Source: "Deploy from a branch"
   - Branch: `gh-pages`
   - Folder: `/ (root)`

3. **Set environment URLs** (optional):
   - Go to Settings → Secrets and Variables → Actions → Variables
   - Add `STAGE_URL` and `PROD_URL`

### Architecture

See [docs/E2E_REPORTS_ARCHITECTURE.md](docs/E2E_REPORTS_ARCHITECTURE.md) for detailed documentation.

---

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
