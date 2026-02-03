# Повний опис проєкту: E2E звіти Playwright та GitHub Pages

Документ для копіювання в doc: що було задумано, як реалізовано в репо, і хто за що відповідає.

---

## 1. Що хотілось (цілі та вимоги)

### 1.1 Загальна мета

- Мати **Vite + React** додаток з **Playwright E2E-тестами**.
- Запускати тести **в CI** (на кожному PR і опційно по розкладу).
- **Публікувати HTML-звіти** тестів так, щоб їх можна було зручно переглядати в браузері, без потреби лазити в артефакти Actions.
- Використовувати **GitHub Pages** як хостинг для:
  - головної сторінки (зібраний додаток);
  - сторінки-огляду звітів (лендінг з посиланнями на PR- та scheduled-звіти).

### 1.2 Функціональні вимоги

- **Локально:** одна команда (`pnpm exec playwright test`) має запускати тести; сервер піднімається автоматично (dev або preview).
- **В CI:** тести мають бігти без ручного запуску сервера; після збірки має бути доступний саме зібраний додаток (як у проді).
- **Звіти:**
  - окремий HTML-звіт на кожен браузер/проєкт (chromium, firefox, webkit, mobile-chrome, mobile-safari для PR; для scheduled — по середовищах і сьютах);
  - одна сторінка-огляд (index) з посиланнями на всі звіти по PR і по scheduled;
  - посилання в коментарі до PR після кожного запуску.
- **GitHub Pages:**
  - корінь `/` — це зібраний React-додаток (як продакшн);
  - `/reports/` — лендінг звітів з навігацією по PR і scheduled;
  - статичні файли мають віддаватися коректно (без Jekyll), у т.ч. кореневий `index.html`.

### 1.3 Нефункціональні вимоги

- Мінімум ручної підтримки: один раз налаштувати Pages, далі все їде з workflow.
- Звіти не рости до нескінченності: обрізати старі (наприклад, останні N run на PR, по середовищах для scheduled, загальний ліміт).
- Якщо коментар у PR або завантаження артефактів не вдалося — deploy звітів не має падати.
- Навігація по звітах: зрозуміло, де ти (breadcrumb), один головний CTA «View report», таби, клавіатура, a11y.

---

## 2. Як це зроблено в репо (реалізація)

### 2.1 Стек і структура

- **Додаток:** React 19, TypeScript, Vite (rolldown-vite).
- **E2E:** Playwright, тести в `e2e/`, конфіг `playwright.config.ts`.
- **CI:** GitHub Actions; окремі workflows для PR, scheduled, setup Pages, загальний CI (lint, type-check, build, опційно deploy на Vercel).
- **Звіти на Pages:** гілка `gh-pages`; вміст формується в job deploy (збірка додатку + копіювання звітів + скрипти).

### 2.2 Локальний запуск тестів

- **Команда:** `pnpm test:e2e` (або `pnpm exec playwright test`).
- **Що відбувається:** Playwright читає `playwright.config.ts`:
  - **Не в CI:** `webServer` запускає `pnpm dev` (Vite dev server на 5173), тести йдуть на `baseURL: http://localhost:5173`.
  - **В CI:** `webServer` запускає `pnpm exec vite preview --port 5173` (віддає вже зібраний `dist/`), тести так само йдуть на 5173.
- **Чому так:** локально зручно з HMR; в CI немає окремого кроку «запустити dev» — після `pnpm build` Playwright сам піднімає preview і тести не отримують connection refused.

**Відповідальні файли:** `playwright.config.ts` (webServer, baseURL), `package.json` (скрипти test:e2e, preview, build).

### 2.3 E2E-тести і очікування title

- У `index.html` заголовок сторінки змінено на «Playwright Cron Test Reports».
- В `e2e/example.spec.ts` очікування title оновлено з `/Vite/` на `/Playwright Cron Test Reports/`, щоб тести не падали через невідповідність.

**Відповідальні файли:** `index.html` (тег `<title>`), `e2e/example.spec.ts` (toHaveTitle).

### 2.4 Workflow для PR (`e2e-pr.yml`)

**Тригер:** `pull_request` (opened, synchronize, reopened).

**Job 1 — E2E (матриця):**

- Один job на кожен проєкт: chromium, firefox, webkit, mobile-chrome, mobile-safari.
- Кроки: checkout → pnpm install → playwright install (браузер для проєкту) → `pnpm build` → `pnpm exec playwright test --project=...` (з reporter html,github,list).
- Тести з `continue-on-error: true`, щоб навіть при падінні тестів артефакт звіту заливався.
- Артефакт: `playwright-report-<project>` (папка `playwright-report` з job).

**Job 2 — Deploy reports:**

- Залежить від першого job; запускається завжди (окрім cancel), щоб звіти залишились навіть при червоному тесті.
- Кроки:
  1. Checkout репо, pnpm install, **pnpm build** (щоб був `dist/`).
  2. **Download artifacts** з іменем `playwright-report-*` у `_artifacts/`; `continue-on-error: true`, щоб відсутність артефактів не ламала deploy.
  3. **Checkout гілки gh-pages** у `_gh-pages/` (continue-on-error, якщо гілки ще немає).
  4. **Prepare site structure:**
     - `mkdir -p _artifacts` (якщо download не створив).
     - Копіювання з _gh-pages у _site: `reports/`, `manifest.json`.
     - **Копіювання додатку:** `cp -R dist/* _site/` (кореневий index.html + assets).
     - **Збереження .nojekyll:** копіювання з _gh-pages або `touch _site/.nojekyll`, щоб GitHub Pages не використовував Jekyll і корінь не давав 404.
     - Створення `_site/reports/pr/<PR_NUMBER>/<RUN_ID>/` і копіювання кожного артефакту в підпапку за іменем job (chromium, firefox, …).
  5. **Update manifest and prune:** виклик `update-manifest-and-prune.mjs` з JSON нового run (pr, runId, sha, branch, actor, timestamp, jobs[]); скрипт додає запис у manifest і видаляє старі звіти за політикою (наприклад, останні 20 run на PR, глобальний cap).
  6. **Generate index:** виклик `generate-index.mjs` — будує `_site/reports/index.html` (лендінг з табами PR / Scheduled, статистика, посилання на run і job).
  7. **Deploy to gh-pages:** peaceiris/actions-gh-pages, publish_dir `_site`, keep_files false (повна заміна гілки).
  8. **Post PR comment:** виклик `post-pr-comment.mjs` (continue-on-error), щоб у PR з’явилось/оновлювалось повідомлення з посиланнями на звіти.

**Відповідальні файли:** `.github/workflows/e2e-pr.yml` (тригер, jobs, кроки, env, permissions).

### 2.5 Workflow для scheduled (`e2e-scheduled.yml`)

**Тригер:** cron (наприклад, щодня) та можливий manual_dispatch.

- Є job setup (обчислення дати тощо) і матриця E2E по середовищах (stage/prod) і сьютах (smoke/regression).
- Кожен E2E job збирає додаток, запускає тести з відповідним проєктом/фільтром, заливає артефакт типу `playwright-report-<env>-<suite>`.
- Deploy job аналогічний до PR: завантаження артефактів, _site з dist + існуючими reports + .nojekyll, копіювання звітів у `_site/reports/scheduled/<ENV>/<DATE>/<RUN_ID>/<SUITE>/`, оновлення manifest, generate-index, push на gh-pages.
- Різниця лише в структурі шляхів (scheduled замість pr) і в тому, що manifest оновлюється для типу `scheduled` (env, date, runId, jobs тощо).

**Відповідальні файли:** `.github/workflows/e2e-scheduled.yml`.

### 2.6 Workflow setup Pages (`setup-pages.yml`)

**Тригер:** ручний запуск (один раз).

- Перевіряє, чи існує гілка `gh-pages`.
- Якщо ні: створює orphan-гілку gh-pages, додає `manifest.json` (порожній), `reports/index.html` (редирект на `../`), **.nojekyll**, коміт і push.
- У виводі дає інструкцію: у Settings → Pages обрати Deploy from a branch, гілка gh-pages, folder / (root).

**Відповідальні файли:** `.github/workflows/setup-pages.yml`.

### 2.7 Скрипт оновлення manifest і обрізання старих звітів (`update-manifest-and-prune.mjs`)

- **Вхід:** `--siteDir`, `--keepPrRuns`, `--keepScheduledPerEnv`, `--globalCap`, `--addReport '<JSON>'`.
- **Що робить:**
  - Читає або створює `manifest.json` у siteDir (структура: pr[prNumber] = [{ runId, timestamp, sha, jobs, actor, branch, url }], scheduled[env] = [{ runId, date, timestamp, sha, jobs, url }], metadata).
  - Парсить addReport (type pr | scheduled), нормалізує jobs (масив або []).
  - Додає новий run на початок відповідного масиву; при повторному runId видаляє старий запис.
  - **Prune:** по кожному PR лишає останні keepPrRuns run; по кожному env для scheduled — останні keepScheduledPerEnv; потім загальний cap (totalReports) — видаляє найстаріші.
  - Видаляє з диску папки старих звітів (reports/pr/..., reports/scheduled/...).
  - Записує оновлений manifest і metadata (lastUpdated, totalReports).

**Відповідальні файли:** `.github/scripts/update-manifest-and-prune.mjs`.

### 2.8 Скрипт генерації лендінгу звітів (`generate-index.mjs`)

- **Вхід:** `--siteDir`, `--repoUrl`, `--pagesUrl`.
- **Що робить:**
  - Читає `manifest.json` з siteDir.
  - Будує HTML-сторінку з:
    - Skip-link, breadcrumb (App → Reports), заголовок, підзаголовок, last updated.
    - Статистика: кількість активних PR, total reports, stage runs, prod runs.
    - Таби (Pull Requests / Scheduled) з ARIA (tablist, tab, tabpanel), підтримка hash (#pr, #scheduled) і клавіатури (стрілки, Home/End).
    - Для кожного PR — секції з run (runId, sha, timestamp, branch), кнопки «View report» (перший job) і «All browsers», потім pills по job (chromium, firefox, …).
    - Для scheduled — аналогічно по env (stage/prod) з run і «View report» / «All suites».
  - Стилі вбудовані (темна тема, кнопки, sticky tabs, focus-visible).
  - Інлайн-скрипт: блок з const/let, arrow functions, без IIFE; перемикання табів по кліку та hash/keyboard.
  - Записує результат у `siteDir/reports/index.html` (mkdir якщо треба).

**Відповідальні файли:** `.github/scripts/generate-index.mjs`.

### 2.9 Скрипт коментаря до PR (`post-pr-comment.mjs`)

- **Вхід:** `--owner`, `--repo`, `--pr`, `--runId`, `--sha`, `--pagesUrl`, `--jobs` (comma-separated), `--status` (success/failure/cancelled).
- **Що робить:** через GitHub API шукає коментар з маркером `<!-- playwright-reports-bot -->` у PR; якщо є — оновлює тіло, якщо немає — створює новий. У тілі: статус run, посилання на звіти (pagesUrl/reports/pr/PR/RUN_ID та по кожному job), посилання на Actions run і commit.
- **Використання:** викликається з e2e-pr.yml після deploy; при помилці має `continue-on-error: true`, щоб не падати весь job.

**Відповідальні файли:** `.github/scripts/post-pr-comment.mjs`.

### 2.10 Чому корінь GitHub Pages міг давати 404

- **Початковий стан:** setup-pages створює тільки `reports/`, `manifest.json`, `.nojekyll` — **без** кореневого `index.html`.
- **Подальші deploy:** e2e-pr/e2e-scheduled з `keep_files: false` повністю замінюють гілку вмістом `_site`. Якщо в _site не додавали `.nojekyll`, після першого такого deploy він зникав з гілки; без нього GitHub може увімкнути Jekyll і поведінка кореня може змінитися.
- **Виправлення:** після `cp -R dist/* _site/` у обох workflows додано копіювання/створення `.nojekyll` у _site. Кожен deploy тепер залишає і кореневий index.html (з dist), і .nojekyll, тому корінь сайту стабільно працює після наступного успішного E2E run.

---

## 3. Хто за що відповідає (довідка по файлах)

| Що | Де | Відповідальність |
|----|-----|-------------------|
| Запуск тестів локально/в CI | `playwright.config.ts` | baseURL, webServer (dev локально, vite preview в CI), retries, workers, reporter. |
| Очікування title сторінки | `e2e/example.spec.ts` | toHaveTitle(/Playwright Cron Test Reports/). |
| Заголовок у браузері | `index.html` | `<title>Playwright Cron Test Reports</title>`. |
| E2E на PR | `.github/workflows/e2e-pr.yml` | Тригер PR; матриця 5 браузерів; build, test, upload artifact; deploy job: dist + reports + .nojekyll, manifest, generate-index, push, PR comment. |
| E2E по розкладу | `.github/workflows/e2e-scheduled.yml` | Cron/manual; матриця env×suite; те саме що в PR, але шляхи scheduled. |
| Ініціалізація Pages | `.github/workflows/setup-pages.yml` | Один раз: створення gh-pages, manifest, reports/index, .nojekyll. |
| Manifest і обрізання | `.github/scripts/update-manifest-and-prune.mjs` | Додавання run у manifest, prune за політикою, видалення старих папок звітів. |
| Лендінг звітів | `.github/scripts/generate-index.mjs` | Читання manifest, генерація reports/index.html (таби, статистика, посилання, breadcrumb, a11y, сучасний JS). |
| Коментар у PR | `.github/scripts/post-pr-comment.mjs` | GitHub API: створити/оновити коментар з посиланнями на звіти. |
| Загальний CI | `.github/workflows/ci.yml` | Push/PR на гілки: lint, type-check, build; опційно deploy (Vercel). |
| Збірка додатку | `package.json`, `vite.config.ts` | pnpm build → dist/; скрипти test:e2e, preview. |

---

## 4. Структура на GitHub Pages (після deploy)

```
https://<owner>.github.io/<repo>/
├── /                      → index.html + assets/ (зібраний Vite/React додаток)
├── .nojekyll              → вимкнення Jekyll
├── manifest.json          → метадані звітів (pr, scheduled, metadata)
└── reports/
    ├── index.html         → лендінг (таби PR / Scheduled, посилання на run і job)
    ├── pr/
    │   └── <PR>/
    │       └── <RUN_ID>/
    │           ├── chromium/   → Playwright HTML report (index.html тощо)
    │           ├── firefox/
    │           ├── webkit/
    │           ├── mobile-chrome/
    │           └── mobile-safari/
    └── scheduled/
        └── <ENV>/
            └── <YYYY-MM-DD>/
                └── <RUN_ID>/
                    ├── smoke/
                    └── regression/
```

---

## 5. Що перевірити після налаштування

1. **Settings → Pages:** Source = Deploy from a branch, branch = gh-pages, folder = / (root).
2. Гілка gh-pages створена (workflow setup-pages.yml запускався хоча б раз).
3. Після успішного E2E run (PR або scheduled) корінь і /reports/ відкриваються без 404; у PR з’являється коментар з посиланнями на звіти.

Цей документ можна копіювати в doc або зберігати в репо як `docs/PROJECT_SUMMARY_UK.md`.
