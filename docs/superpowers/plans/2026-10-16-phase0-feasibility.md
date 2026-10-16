# Фаза 0: проверка осуществимости — план выполнения

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Получить собранные из исходников Mailspring и Mailspring-Sync для Linux, macOS и Windows, прогнать против тестового mailcow все сценарии из спецификации и выдать решение go/no-go с подтверждёнными рисками.

**Architecture:** Форки обоих репозиториев на GitHub, сборка Win/Mac через GitHub Actions в режиме «без подписи, артефакты», локальная разработка и ручные сценарии на Linux (движок кроссплатформенный, протокольная логика одна). Серверные сценарии (DAV, free/busy, ManageSieve) проверяются скриптами независимо от Mailspring, чтобы отделить проблемы SOGo/Dovecot от проблем клиента.

**Tech Stack:** Node 20 (как в CI Mailspring), npm, Electron 44, Mailspring-Sync (C++, build.sh / MSBuild+vcpkg), GitHub Actions, curl, openssl s_client, Playwright, mailcow-dockerized.

**Spec:** `docs/superpowers/specs/2026-10-16-outlook-clone-design.md` (раздел 5, Фаза 0; раздел 2, таблица фактов; раздел 6, риски).

## Global Constraints

- Node.js 20 LTS для всех сборок (CI Mailspring использует `node-version: '20'`); локально через `mise use node@20` в каталоге клиента.
- Никакого ребрендинга в фазе 0: имя `Mailspring` остаётся в путях и бандле, иначе `mailsync --mode install-check` падает на branding-проверке (путь должен содержать `mailspring`).
- Движок требует переменные `CONFIG_DIR_PATH` и `IDENTITY_SERVER` при автономном запуске; при запуске из приложения их выставляет `mailsync-process.ts`.
- Mailspring ID не создаём: в онбординге выбираем «Skip» (опционален с 1.9).
- Сборки без подписи: `SIGN_BUILD` не выставляется, шаги codesign/notarize/Azure/AWS из workflow удаляются или отключаются условием.
- Тестовый mailcow: отдельный домен `test.<ваш-домен>` с тремя ящиками `alice@`, `bob@`, `shared@`; продуктивные ящики не трогаем.
- Все результаты проверок фиксируются в `docs/superpowers/phase0/results/*.md` в формате «проверка | ожидание | факт | pass/fail».
- Код фазы 0 живёт в ветке `phase0-spike` форка клиента; изменения workflow в форке движка — в ветке `phase0-ci`.

## Review Focus

- Shared-namespace Dovecot (`Shared/bob@…`): движок строит пути через `defaultNamespace()` (SyncWorker.cpp:790, 907); папки чужого namespace могут не отобразиться или получить неверный разделитель. Проверяется в Task 6.
- Двойная рассылка приглашений: SOGo шлёт iMIP серверно при PUT события с ATTENDEE, движок тоже умеет (TaskProcessor.cpp:3038). Bob должен получить ровно одно письмо. Проверяется в Task 7.
- Автообнаружение DAV на mailcow: движок идёт по `https://<домен-почты>/.well-known/caldav`; у mailcow домен почты (`test.example.com`) и хост SOGo (`mail.example.com`) различаются, DNS SRV может отсутствовать. Проверяется в Task 7.
- ManageSieve и фильтры mailcow UI: mailcow хранит свои фильтры отдельно (sieve_before/after); скрипт, загруженный через ManageSieve, должен применяться вместе с ними, а не затирать их. Проверяется в Task 9.
- Fluent UI внутри Electron-рендерера Mailspring: Griffel вставляет `<style>` в runtime; CSP `index.html` и порядок с LESS могут ломать стили. Проверяется в Task 10.

---

### Task 1: Форки и локальное окружение

**Files:**
- Create: `~/Work/OutGluk/client/` (клон форка Mailspring, ветка `phase0-spike`), `client/mailsync/` (submodule → форк Mailspring-Sync)
- Create: `client/.mise.toml`
- Move: `~/Work/OutGluk/docs/superpowers/**` → `client/docs/superpowers/**`

**Interfaces:**
- Produces: каталог `client/` как корень всех последующих задач; GitHub-репозитории `<org>/Mailspring` и `<org>/Mailspring-Sync`.

- [ ] **Step 1: Форкнуть оба репозитория**

```bash
gh repo fork Foundry376/Mailspring --org <org> --clone=false
gh repo fork Foundry376/Mailspring-Sync --org <org> --clone=false
```
Ожидание: оба форка видны в `gh repo list <org>`.

- [ ] **Step 2: Клонировать клиент, переключить submodule на наш форк**

```bash
git clone git@github.com:<org>/Mailspring.git ~/Work/OutGluk/client
cd ~/Work/OutGluk/client && git checkout -b phase0-spike
git submodule set-url mailsync git@github.com:<org>/Mailspring-Sync.git
git submodule update --init
```
Ожидание: `git submodule status` показывает хэш, совпадающий с upstream `.gitmodules` pin.

- [ ] **Step 3: Зафиксировать Node 20**

Создать `client/.mise.toml` с `[tools] node = "20"`, выполнить `mise install && node --version`.
Ожидание: `v20.x`.

- [ ] **Step 4: Перенести документы в репозиторий**

```bash
mv ~/Work/OutGluk/docs/superpowers ~/Work/OutGluk/client/docs/superpowers
```
Ожидание: `client/docs/superpowers/specs/2026-10-16-outlook-clone-design.md` существует.

- [ ] **Step 5: Commit**

```bash
git add .gitmodules .mise.toml docs/superpowers
git commit -m "chore: phase0 workspace — fork submodule, node 20, spec and plan"
git push -u origin phase0-spike
```

---

### Task 2: Локальная dev-сборка клиента на Linux (prebuilt mailsync)

**Files:**
- Modify: ничего в коде; результат в `client/docs/superpowers/phase0/results/task2-linux-dev.md`

**Interfaces:**
- Produces: работающий `npm start` с prebuilt движком; базовая линия для сравнения с нашим CI-движком в Task 5.

- [ ] **Step 1: Временно убрать submodule из postinstall-проверки**

`scripts/postinstall.js:166` качает prebuilt только если нет `./mailsync/build.sh`. Для базовой линии переименовать: `mv mailsync mailsync.off`.

- [ ] **Step 2: Установить зависимости и запустить**

```bash
npm install 2>&1 | tee /tmp/npm-install.log
npm start
```
Ожидание: в логе `Downloaded Mailsync prebuilt binary`; окно онбординга открывается; в консоли нет `Error: Cannot find module`.

- [ ] **Step 3: Прогнать штатные тесты**

```bash
npm run typecheck && npm run lint:check && npm test
```
Ожидание: все три команды с кодом 0. Если `npm test` падает на sandbox — применить `sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0` как в `test.yaml`.

- [ ] **Step 4: Вернуть submodule и записать результат**

`mv mailsync.off mailsync`. Записать в `results/task2-linux-dev.md`: версия Node, время `npm install`, результат трёх команд, версия prebuilt mailsync (`./app/mailsync --help | head -1` даёт usage).

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/phase0/results/task2-linux-dev.md
git commit -m "docs(phase0): linux dev build baseline"
```

---

### Task 3: Тестовый mailcow и проверка портов

**Files:**
- Create: `client/scripts/phase0/env.sh.example`, `client/scripts/phase0/env.sh` (в `.gitignore`), `client/scripts/phase0/check-server.sh`
- Create: `client/docs/superpowers/phase0/results/task3-server.md`

**Interfaces:**
- Produces: `env.sh` с переменными `MAILCOW_HOST`, `TEST_DOMAIN`, `ALICE_USER ALICE_PASS BOB_USER BOB_PASS SHARED_USER SHARED_PASS`, `SIEVE_PORT=4190`; все скрипты задач 7–9 делают `source scripts/phase0/env.sh`.

- [ ] **Step 1: Подготовить сервер**

Если есть mailcow — создать домен `test.<домен>` и три ящика в UI. Если нет — `git clone https://github.com/mailcow/mailcow-dockerized` на тестовую VM, `./generate_config.sh`, `docker compose up -d`, затем домен и ящики. В `mailcow.conf` убедиться, что `DOVECOT_SIEVE_PORT` не закомментирован/не изменён (по умолчанию 4190) и порт открыт в файрволе.

- [ ] **Step 2: Написать проверочный скрипт**

`check-server.sh`: для каждого из портов 993, 465, 587, 4190 — `openssl s_client -connect $MAILCOW_HOST:$port` (для 587 и 4190 с `-starttls smtp` / `-starttls sieve`), grep `Verify return code: 0`; затем `curl -sI https://$MAILCOW_HOST/.well-known/caldav` и `/.well-known/carddav` с ожиданием `301|302` и `Location: .*/SOGo/dav`; затем `curl -u $ALICE_USER:$ALICE_PASS -X PROPFIND -H 'Depth: 0' https://$MAILCOW_HOST/SOGo/dav/$ALICE_USER/` с ожиданием `207`. Скрипт печатает `PASS`/`FAIL` на строку и завершается с кодом 1, если есть FAIL.

- [ ] **Step 3: Запустить**

```bash
bash scripts/phase0/check-server.sh
```
Ожидание: все строки `PASS`, код 0. Сохранить вывод в `results/task3-server.md`. Если `.well-known` на `test.<домен>` (не на `MAILCOW_HOST`) не отвечает — зафиксировать отдельно: это вход для Task 7.

- [ ] **Step 4: Commit**

```bash
git add scripts/phase0/env.sh.example scripts/phase0/check-server.sh .gitignore docs/superpowers/phase0/results/task3-server.md
git commit -m "chore(phase0): test mailcow env and server checks"
```

---

### Task 4: CI-сборка движка на трёх платформах

**Files:**
- Modify (форк Mailspring-Sync, ветка `phase0-ci`): `.github/workflows/build.yml`, `.github/workflows/build-windows.yml`

**Interfaces:**
- Produces: артефакты `mailsync-linux`, `mailsync-macos`, `mailsync-windows` (tar.gz) на каждом push в любую ветку; скачиваются `gh run download`.

- [ ] **Step 1: Снять ограничения «только master» в build.yml**

В `build.yml`: шаг `Upload artifact` (строка ~122) — убрать условие `github.ref == 'refs/heads/master'`, чтобы macOS-артефакт выгружался всегда; шаги `Setup AWS CLI`/S3 оставить под условием master (они не сработают без секретов — это нормально). Триггер `on.push.branches` дополнить `phase0-ci`.

- [ ] **Step 2: То же для build-windows.yml**

Артефакт уже выгружается без условия (строка ~172); S3-шаг — под master. Добавить `phase0-ci` в триггеры.

- [ ] **Step 3: Push и ожидание**

```bash
cd mailsync && git checkout -b phase0-ci && git commit -am "ci: upload mailsync artifacts on all branches" && git push -u origin phase0-ci
gh run list --repo <org>/Mailspring-Sync --branch phase0-ci
```
Ожидание: 4 джоба (ubuntu-22.04, ubuntu-24.04-arm, macos-latest, windows-2022) зелёные; macOS-шаг `Run install-check` печатает `install-check passed`.

- [ ] **Step 4: Скачать артефакты**

```bash
gh run download <run-id> --repo <org>/Mailspring-Sync -D /tmp/mailsync-artifacts
ls -R /tmp/mailsync-artifacts
```
Ожидание: три `mailsync.tar.gz` (linux, macos, windows). Записать run-id, длительность каждой джобы и размер бинарей в `results/task4-sync-ci.md`.

- [ ] **Step 5: Commit результатов в клиенте**

```bash
git add docs/superpowers/phase0/results/task4-sync-ci.md
git commit -m "docs(phase0): mailsync CI builds on linux/macos/windows"
```

---

### Task 5: CI-сборка клиента без подписи для macOS и Windows

**Files:**
- Modify: `.github/workflows/build-macos.yaml`, `.github/workflows/build-windows.yaml`
- Modify: `scripts/postinstall.js:164-175`

**Interfaces:**
- Consumes: артефакты движка из Task 4 (через `gh run download` внутри workflow по `MAILSYNC_RUN_ID`).
- Produces: артефакты `Mailspring-macos-arm64.zip`, `Mailspring-macos-x64.zip`, `Mailspring-windows` (установщик из `app/dist`) с нашим движком внутри.

- [ ] **Step 1: Научить postinstall пропускать скачивание при наличии бинаря**

В `postinstall.js` перед проверкой `./mailsync/build.sh` добавить: если `process.env.MAILSYNC_PREBUILT_DIR` задан — распаковать `${MAILSYNC_PREBUILT_DIR}/mailsync.tar.gz` в `./app` и не ходить в S3. Проверка локально: `MAILSYNC_PREBUILT_DIR=/tmp/mailsync-artifacts/mailsync-linux npm run postinstall` → в `app/` появляется наш `mailsync`, в логе нет `Downloaded Mailsync prebuilt`.

- [ ] **Step 2: Переписать build-macos.yaml в режим артефактов**

Удалить шаги `Fail if branch is not main`, `Setup Codesigning`, `Setup Provisioning Profile`, `Setup AWS CLI`, `Sync artifacts to S3 bucket`. В `Build` убрать `SIGN_BUILD=true` и Apple/Sentry env. Добавить перед `Install Dependencies` шаг `gh run download ${{ inputs.mailsync_run_id }} --repo <org>/Mailspring-Sync -n mailsync-macos -D mailsync-prebuilt` (с `GH_TOKEN: ${{ github.token }}` и правом `actions: read`; для чужого репо — PAT в секрете `SYNC_REPO_TOKEN`), выставить `MAILSYNC_PREBUILT_DIR: mailsync-prebuilt` для `npm ci`. Триггер `workflow_dispatch` с input `mailsync_run_id`. В конце `actions/upload-artifact` с `path: app/dist/*.zip`.

- [ ] **Step 3: То же для build-windows.yaml**

Удалить guard, AWS, оба Azure-шага подписи; добавить скачивание `mailsync-windows`; `upload-artifact` с `path: app/dist/` (установщик Squirrel `*.exe` и `RELEASES`).

- [ ] **Step 4: Запустить обе сборки**

```bash
gh workflow run build-macos.yaml --ref phase0-spike -f mailsync_run_id=<run-id из Task 4>
gh workflow run build-windows.yaml --ref phase0-spike -f mailsync_run_id=<run-id>
```
Ожидание: 3 джоба зелёные (macos arm64, macos intel, windows); артефакты скачиваются `gh run download`. Если macOS-рантайм `macos-26`/`macos-26-intel` недоступен в форке — заменить на `macos-15`/`macos-15-intel` или `macos-13` и зафиксировать.

- [ ] **Step 5: Smoke на реальных машинах**

На Mac: распаковать zip, `xattr -dr com.apple.quarantine Mailspring.app`, запустить; на Windows: запустить установщик с предупреждением SmartScreen («Подробнее → Выполнить в любом случае»). В обоих: онбординг открылся, добавление IMAP-аккаунта `alice@` проходит (Task 6, шаг 2), письма синхронизируются. Записать в `results/task5-client-ci.md`: run-id, длительности, размеры артефактов, факт запуска на каждой ОС. Если машин нет — зафиксировать как «не проверено на железе» и считать условием go.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/build-macos.yaml .github/workflows/build-windows.yaml scripts/postinstall.js docs/superpowers/phase0/results/task5-client-ci.md
git commit -m "ci(phase0): unsigned macOS/Windows client builds with CI-built mailsync"
```

---

### Task 6: Сценарий «Почта»: IMAPS/SMTPS, папки, общий ящик

**Files:**
- Create: `client/docs/superpowers/phase0/results/task6-mail.md`

**Interfaces:**
- Consumes: `env.sh` (Task 3); локальная сборка с нашим `mailsync-linux` (`MAILSYNC_PREBUILT_DIR=... npm run postinstall && npm start`).
- Produces: подключённые аккаунты `alice@` и `bob@` в dev-профиле `Mailspring-dev` для Task 7.

- [ ] **Step 1: Подготовить общий ящик на сервере**

В SOGo под `shared@` (или через `docker compose exec dovecot-mailcow doveadm acl set -u shared@$TEST_DOMAIN INBOX user=alice@$TEST_DOMAIN lookup read write write-seen insert post`) дать `alice@` доступ к INBOX ящика `shared@`. Проверка: `doveadm acl get -u shared@... INBOX` показывает alice.

- [ ] **Step 2: Добавить аккаунты в клиент**

Онбординг → «IMAP / SMTP» → `alice@`, пароль, хост `$MAILCOW_HOST`, IMAP 993 SSL, SMTP 465 SSL. Повторить для `bob@`. Ожидание: оба аккаунта в сайдбаре, INBOX синхронизирован, в `~/.config/Mailspring-dev/mailsync-*.log` нет `ErrorAuthentication`.

- [ ] **Step 3: Отправить и получить**

От alice → bob письмо с вложением 1 МБ. Ожидание: в аккаунте bob письмо появляется ≤ 60 с без ручного обновления; у alice копия в Sent; ответ bob → alice образует тред у alice.

- [ ] **Step 4: Операции с папками и флагами**

У alice: создать папку `Проекты/Альфа` (кириллица, вложенность), переместить письмо, поставить звезду, пометить непрочитанным, удалить в Trash. Проверить через SOGo-веб, что все изменения дошли (UTF-7 имя папки отображается кириллицей, флаги `\Flagged`, `\Seen` совпадают).

- [ ] **Step 5: Общий ящик**

У alice в сайдбаре найти папку общего namespace (ожидаемое имя `Shared/shared@…/INBOX` или аналог). Отправить письмо от bob на `shared@`. Ожидание: письмо видно у alice в общей папке, открывается, помечается прочитанным, и это отражается у `shared@` в SOGo. Если папка не отображается — выполнить `grep -n "Shared" ~/.config/Mailspring-dev/mailsync-alice*.log` и `LIST "" "*"` через `openssl s_client` вручную, зафиксировать ответ сервера и поведение движка; это подтверждённый риск для фазы 4.

- [ ] **Step 6: Записать и закоммитить**

Таблица проверка/ожидание/факт в `results/task6-mail.md`.
```bash
git add docs/superpowers/phase0/results/task6-mail.md
git commit -m "docs(phase0): mail scenario results"
```

---

### Task 7: Сценарий «Календарь и контакты»: обнаружение DAV, события, приглашения, общие календари

**Files:**
- Create: `client/scripts/phase0/dav-probe.sh`
- Create: `client/docs/superpowers/phase0/results/task7-dav.md`

**Interfaces:**
- Consumes: аккаунты из Task 6; `env.sh`.
- Produces: событие с участниками в календаре alice (UID записать в `results/task7-dav.md`) — используется в Task 8 для free/busy.

- [ ] **Step 1: Протокольная проба без клиента**

`dav-probe.sh`: PROPFIND `current-user-principal` на `https://$MAILCOW_HOST/SOGo/dav/`, затем `calendar-home-set` и `addressbook-home-set` на principal, затем PROPFIND Depth 1 на home-set с `displayname`, `resourcetype`, `calendar-color`. Ожидание: 207 на всех трёх, в списке коллекций есть `Calendar/personal/` и `Contacts/personal/`. Вывод в `results/task7-dav.md`.

- [ ] **Step 2: Обнаружение в клиенте**

В Mailspring у alice открыть Calendar и Contacts (меню Window). Ожидание: календарь `personal` и адресная книга видны без ручного ввода URL. Если не видны — в логе движка найти строку `CalDAV:` с причиной (нет `.well-known` на домене почты `$TEST_DOMAIN` / нет SRV). Тогда: добавить на DNS `_caldavs._tcp.$TEST_DOMAIN SRV 0 1 443 $MAILCOW_HOST` и `_carddavs._tcp` аналогично, повторить. Зафиксировать, что требуется от DNS для автообнаружения — это вход для автонастройки в фазе 2.

- [ ] **Step 3: Контакт туда и обратно**

Создать контакт в клиенте у alice (имя кириллицей, два e-mail, телефон). Ожидание: контакт появляется в SOGo-веб ≤ 60 с. Изменить его в SOGo, ожидание: изменение приходит в клиент после «Refresh».

- [ ] **Step 4: Событие с участником и подсчёт приглашений**

Перед шагом: в `mailsync/MailSync/TaskProcessor.cpp` найти функцию, содержащую строку 3038 (`iMIP`), и записать в результаты, из какого Task она вызывается (ожидается `SyncbackEventTask` → `performRemoteSyncbackEvent`) и при каком условии. Затем у alice создать событие завтра 10:00–11:00 с участником `bob@`. Через 2 мин у bob: `openssl s_client -connect $MAILCOW_HOST:993` → `LOGIN`, `SELECT INBOX`, `SEARCH SUBJECT "<тема события>"`. Ожидание: ровно 1 письмо-приглашение. Если 2 — зафиксировать отправителей (SOGo vs клиент) по заголовкам `User-Agent`/`X-Mailer`; это подтверждённый риск, решение «отключить клиентскую отправку для SOGo» уходит в фазу 4. Также проверить `Sent` у alice: есть ли копия (ожидаем «нет» для серверной, баг SOGo 6229).

- [ ] **Step 5: RSVP и статус участника**

У bob в клиенте открыть приглашение в INBOX, нажать «Accept». Ожидание: у alice в событии участник bob получает PARTSTAT=ACCEPTED (проверить `curl GET` ICS события по URL из PROPFIND шага 1, grep `PARTSTAT=ACCEPTED`), и в календаре bob событие появилось.

- [ ] **Step 6: Повторяющееся событие и исключение**

У alice: событие еженедельно 4 раза, затем удалить одно вхождение. Ожидание: в ICS появился `EXDATE`, в SOGo-веб вхождение отсутствует, в клиенте остальные три на месте.

- [ ] **Step 7: Общий календарь**

В SOGo-веб под bob расшарить `personal` для alice с правами «изменять». У alice: «Refresh Calendars». Ожидание: календарь bob виден, помечен как shared (клиент 1.26 различает owned/shared), создание события в нём alice проходит и видно у bob. Проверить и обратный случай «только чтение»: права bob → «просмотр», попытка правки у alice даёт ошибку, а не тихий провал.

- [ ] **Step 8: Записать и закоммитить**

```bash
git add scripts/phase0/dav-probe.sh docs/superpowers/phase0/results/task7-dav.md
git commit -m "docs(phase0): caldav/carddav scenario results"
```

---

### Task 8: Free/busy на SOGo

**Files:**
- Create: `client/scripts/phase0/freebusy-probe.sh`
- Create: `client/docs/superpowers/phase0/results/task8-freebusy.md`

**Interfaces:**
- Consumes: событие alice из Task 7 (завтра 10:00–11:00).
- Produces: подтверждённый рабочий эндпоинт free/busy и формат ответа для модуля `freebusy/` фазы 4.

- [ ] **Step 1: Три запроса от имени bob про alice**

`freebusy-probe.sh` выполняет и сохраняет тело и код каждого:
1. `curl -u $BOB_USER:$BOB_PASS https://$MAILCOW_HOST/SOGo/dav/$ALICE_USER/freebusy.ifb`
2. `curl -u $BOB_USER:$BOB_PASS "https://$MAILCOW_HOST/SOGo/so/$ALICE_USER/freebusy.ifb/ajaxRead?sday=$(date -d tomorrow +%Y%m%d)&eday=$(date -d '+2 days' +%Y%m%d)"`
3. RFC 6638: PROPFIND `schedule-outbox-URL` на principal bob, затем `POST` на outbox с `Content-Type: text/calendar` и телом `VFREEBUSY` (`METHOD:REQUEST`, `ORGANIZER:mailto:bob@…`, `ATTENDEE:mailto:alice@…`, `DTSTART/DTEND` на завтра).

- [ ] **Step 2: Оценить**

Ожидание: (1) код 200 и `VFREEBUSY` содержит `FREEBUSY:` с интервалом 10:00–11:00 завтра; (2) код 200, JSON с занятым слотом; (3) любой результат — фиксируем код и тело (ожидаем, что либо 200 с `schedule-response`, либо 403/501). Проверить также `SOGoFreeBusyDefaultInterval`: событие через 30 дней должно отсутствовать в (1), если интервал по умолчанию `(7,7)`; записать, нужно ли менять параметр на сервере для помощника планирования.

- [ ] **Step 3: Записать и закоммитить**

```bash
git add scripts/phase0/freebusy-probe.sh docs/superpowers/phase0/results/task8-freebusy.md
git commit -m "docs(phase0): sogo free/busy endpoints verified"
```

---

### Task 9: ManageSieve на mailcow

**Files:**
- Create: `client/scripts/phase0/sieve-probe.sh`, `client/scripts/phase0/test-rule.sieve`
- Create: `client/docs/superpowers/phase0/results/task9-sieve.md`

**Interfaces:**
- Produces: подтверждённая последовательность команд ManageSieve для модуля `managesieve/` фазы 3 и правило сосуществования с фильтрами mailcow UI.

- [ ] **Step 1: Тестовый скрипт**

`test-rule.sieve`:
```
require ["fileinto"];
if header :contains "subject" "[phase0]" { fileinto "Проекты/Альфа"; }
```

- [ ] **Step 2: Сессия ManageSieve**

`sieve-probe.sh` через `openssl s_client -quiet -starttls sieve -connect $MAILCOW_HOST:$SIEVE_PORT` отправляет: `AUTHENTICATE "PLAIN" "<base64(\0alice\0pass)>"`, `LISTSCRIPTS`, `PUTSCRIPT "outgluk" {<len>+}\r\n<скрипт>`, `SETACTIVE "outgluk"`, `GETSCRIPT "outgluk"`, `LOGOUT`. Ожидание: после каждой команды `OK`; `LISTSCRIPTS` после `SETACTIVE` показывает `"outgluk" ACTIVE`. Зафиксировать строку capabilities сервера (`"SIEVE" "..."`): нужны `fileinto`, `vacation`, `imap4flags`, `envelope`, `variables`.

- [ ] **Step 3: Применение правила**

От bob отправить alice письмо с темой `[phase0] тест`. Ожидание: через IMAP у alice письмо в `Проекты/Альфа`, не в INBOX. Отправить второе без метки — остаётся в INBOX.

- [ ] **Step 4: Сосуществование с фильтрами mailcow**

В mailcow UI (ящик alice → «Sieve filters») создать prefilter «тема содержит `[ui]` → fileinto INBOX/UI». Отправить два письма: `[ui]` и `[phase0]`. Ожидание: оба правила сработали, скрипт `outgluk` остался активным (`LISTSCRIPTS`). Если фильтр из UI перестал работать или наш скрипт деактивирован — зафиксировать как ограничение для фазы 3.

- [ ] **Step 5: Записать и закоммитить**

```bash
git add scripts/phase0/sieve-probe.sh scripts/phase0/test-rule.sieve docs/superpowers/phase0/results/task9-sieve.md
git commit -m "docs(phase0): managesieve on mailcow verified"
```

---

### Task 10: Fluent UI v9 внутри рендерера Mailspring

**Files:**
- Create: `app/internal_packages/fluent-spike/package.json`, `app/internal_packages/fluent-spike/lib/main.tsx`, `app/internal_packages/fluent-spike/lib/fluent-toolbar-button.tsx`
- Create: `playwright/tests/fluent-spike.spec.ts`
- Modify: `app/package.json` (dependencies)
- Create: `client/docs/superpowers/phase0/results/task10-fluent.md`

**Interfaces:**
- Produces: `FluentToolbarButton` — React-компонент, регистрируемый через `ComponentRegistry.register(FluentToolbarButton, { role: 'ThreadActionsToolbarButton' })`, который по клику вызывает `Actions.composeNewBlankDraft()`.

- [ ] **Step 1: Failing e2e-тест**

`playwright/tests/fluent-spike.spec.ts` по образцу `compose.spec.ts`:
```ts
test('fluent toolbar button opens composer', async () => {
  await mainWindow.locator('[data-testid="fluent-compose"]').click();
  const composerPage = await findComposer(electronApp);
  expect(composerPage).not.toBeNull();
});
```

- [ ] **Step 2: Запустить, убедиться, что падает**

`npx playwright test --config playwright/playwright.config.ts -g "fluent toolbar"` → FAIL: локатор не найден.

- [ ] **Step 3: Зависимости**

```bash
cd app && npm install @fluentui/react-components@9.74.9 @fluentui/react-icons@2 --save
```
Ожидание: установка без `ERESOLVE` (peer `react >=16.14.0 <20.0.0` принимает 17.0.2).

- [ ] **Step 4: Пакет-спайк**

`package.json` пакета: `"windowTypes": {"default": true}`. `main.tsx`: `activate()` регистрирует компонент, `deactivate()` снимает. `fluent-toolbar-button.tsx`: `<FluentProvider theme={webLightTheme}><Button appearance="primary" icon={<MailAddRegular/>} data-testid="fluent-compose" onClick={() => Actions.composeNewBlankDraft()}>Новое письмо</Button></FluentProvider>`.

- [ ] **Step 5: Запустить тест и typecheck**

`npm run typecheck && npx playwright test ... -g "fluent toolbar"` → PASS. Если стили не применились (кнопка без Fluent-оформления) — открыть DevTools, проверить `<style data-make-styles-bucket>` в `<head>` и ошибки CSP в консоли; зафиксировать, что потребовалось (например, правка `Content-Security-Policy` в `app/static/index.html`).

- [ ] **Step 6: Измерить и записать**

В `results/task10-fluent.md`: прирост `app/node_modules` (du -sh до/после), время до появления главного окна (`--enable-logging`, разница меток до/после, 3 замера), размер `<style>`-инъекций, конфликты с LESS (`body` font, `button` reset). Вывод: «Fluent можно внедрять покомпонентно: да/нет, с какими оговорками».

- [ ] **Step 7: Commit**

```bash
git add app/package.json app/package-lock.json app/internal_packages/fluent-spike playwright/tests/fluent-spike.spec.ts docs/superpowers/phase0/results/task10-fluent.md
git commit -m "spike(phase0): fluent ui v9 button inside mailspring renderer"
```

---

### Task 11: Отчёт go/no-go

**Files:**
- Create: `client/docs/superpowers/phase0/report.md`
- Modify: `client/docs/superpowers/specs/2026-10-16-outlook-clone-design.md` (раздел 6 «Риски», раздел 5 оценки)

**Interfaces:**
- Consumes: все `results/task*.md`.

- [ ] **Step 1: Собрать таблицу**

`report.md`: строка на каждую проверку из задач 2–10: «проверка | результат | влияние на фазу N | решение». Отдельный блок «Подтверждённые риски» с ссылками на результаты, блок «Снятые риски».

- [ ] **Step 2: Решение**

Критерии go: (а) движок и клиент собираются в CI на всех трёх платформах; (б) почта и CalDAV/CardDAV работают с mailcow без правок движка или с правками ≤ 1 дня; (в) хотя бы один free/busy-эндпоинт даёт корректные интервалы; (г) ManageSieve работает и не ломает фильтры mailcow; (д) Fluent-компонент рендерится в приложении. Любой провал (а) или (б) — no-go для варианта A, возврат к спецификации раздел 2.

- [ ] **Step 3: Обновить спецификацию**

Перенести подтверждённые факты в таблицу раздела 2, обновить строки рисков раздела 6 («подтверждён/снят»), скорректировать длительности фаз 2–4, если проверки вскрыли дополнительную работу (например, DNS SRV для автообнаружения, отключение клиентского iMIP).

- [ ] **Step 4: Commit и PR**

```bash
git add docs/superpowers
git commit -m "docs(phase0): go/no-go report"
git push && gh pr create --title "Phase 0: feasibility results" --body-file docs/superpowers/phase0/report.md
```
