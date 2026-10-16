# OutGluk — настольный клиент в стиле Outlook для mailcow

Дата: 2026-10-16. Статус: решения по п.7 приняты 2026-10-16, документ согласован на уровне подхода.

## 1. Цель

Настольный клиент (Windows, macOS), внешне и по привычкам работы максимально похожий на классический/новый Outlook, поверх mailcow:

- Почта: IMAPS (993), SMTPS (465) / submission (587).
- Контакты: CardDAV (SOGo, `https://<host>/SOGo/dav/<user>/Contacts/<id>/`).
- Календари, встречи, приглашения, ответы: CalDAV (SOGo, `.../Calendar/<id>/`), iMIP.
- Свободен/занят: SOGo free/busy (`/SOGo/dav/<user>/freebusy.ifb`, JSON `/SOGo/so/<user>/freebusy.ifb/ajaxRead?sday=YYYYMMDD&eday=YYYYMMDD`).
- Серверные правила: Sieve через ManageSieve (Dovecot, порт 4190, в compose `${DOVECOT_SIEVE_PORT:-4190}`).
- Созвоны: кнопка «Добавить ссылку на созвон» в редакторе встречи. Google Meet через API — в плане, Workspace-аккаунта пока нет; в первом релизе ручная вставка ссылки.
- Общие почтовые ящики (Dovecot ACL / shared namespace) и делегирование календарей (SOGo ACL) — в первом релизе.
- Импорт PST из старого Outlook (письма, контакты, календарь) с загрузкой на сервер.

Не цель: имя и логотип Outlook, Exchange/EWS, ActiveSync, мобильные клиенты, Linux-сборка в первом релизе (бесплатно получится, но не тестируем).

## 2. Ключевое решение: основа

### Что проверено (октябрь 2026)

| Факт | Источник |
|---|---|
| Mailspring 1.26.0 вышел 2026-10-01, проект живой | CHANGELOG |
| Движок Mailspring-Sync: C++11, MailCore2/libetpan, SQLite, GPLv3, один процесс на аккаунт, JSON по stdin/stdout | README Mailspring-Sync |
| В Mailspring **уже есть** CardDAV-контакты (с 1.7), CalDAV-календарь с видами день/неделя/месяц/агенда, повторения, RSVP, ответы на приглашения, правка событий (1.17–1.26) | CHANGELOG |
| Есть клиентские правила (Rules), но без Sieve | CHANGELOG |
| Стек UI: Electron 44, React 17, reflux, Slate 0.45 (композер), LESS-темы | app/package.json |
| Fluent UI React v9 (`@fluentui/react-components` 9.74.x): MIT, peer `react >=16.14 <20` — совместим с React 17 | unpkg |
| Fluent UI System Icons: MIT | GitHub |
| Mailspring ID (облако) опционален с 1.9 — можно отключить/вырезать | Snap/FileHorse |
| SOGo: `CALDAV:free-busy-query` REPORT отдаёт 501 (баг 5282, открыт) — использовать `.ifb`/JSON, не REPORT | bugs.sogo.nu |
| SOGo рассылает приглашения серверно при PUT события с ATTENDEE; копия в Sent не кладётся (баг 6229) | bugs.sogo.nu |
| Google Meet REST API `spaces.create` даёт ссылку без события в Google Calendar; нужен OAuth пользователя Workspace | developers.google.com |
| PST: `pst-extractor` (порт java-libpst, TS, читает письма/вложения; упоминаются форки Apache-2.0 / MIT, upstream малоактивен) | npm |

### Варианты

**A. Форк Mailspring (рекомендую).**
Получаем сразу: sync-движок IMAP с CONDSTORE, SMTP, CardDAV, CalDAV с RSVP и повторениями, поиск, треды, композер, локализацию, сборки Win/Mac.
Делаем сами: Fluent-облик и Outlook-раскладка, Sieve, free/busy + помощник планирования, Meet, PST, ребрендинг.
Цена: GPLv3 на весь форк, Electron (не Tauri), легаси React 17 + Slate 0.45, необходимость собирать C++-движок на Win/Mac.
Оценка: 4–6 мес. одним сильным разработчиком, 3–4 мес. вдвоём.

**B. Своё с нуля: Tauri + Rust-движок (async-imap, lettre, libdav) + Fluent UI React.**
Плюсы: лицензия на выбор, вес, чистый код.
Минусы: sync-движок с локальным кэшем, тредами, поиском, оффлайн-очередью операций — самая дорогая и самая «багоёмкая» часть. 10–14 мес. до паритета с тем, что в A есть в день 0. Брать только если GPL неприемлем.

**C. Гибрид: Mailspring-Sync как sidecar + новый Fluent-фронтенд (Electron или Tauri).**
Переиспользует движок, фронт пишется с нуля на Fluent. Но большая часть логики Mailspring (модели, очередь задач, подписки на запросы, композер) живёт во фронте, протокол движка документирован слабо, GPL всё равно остаётся. Не окупается против A; возможен как второй этап, если легаси фронта станет невыносимым.

**Tauri** имеет смысл только в B. В A и C — Electron, который уже есть.

### Юридические рамки

- GPLv3: исходники форка публикуются при распространении бинарников. Внутреннее использование в компании без распространения наружу — обязательств нет.
- Нельзя: имя/логотип Outlook, имя Mailspring в продвижении (ограничение в их лицензии).
- Можно: Fluent UI, Fluent Icons (MIT), общая раскладка и паттерны UX.

## 3. Архитектура (вариант A)

```
┌──────────────────────── Electron (OutGluk) ────────────────────────┐
│  Renderer: React 17 + Fluent UI v9 + Fluent Icons                   │
│   ├─ Mail (3 панели: папки | список | чтение)   ← Mailspring        │
│   ├─ Calendar (день/нед/мес, редактор встречи)  ← Mailspring + наше │
│   ├─ People                                     ← Mailspring        │
│   ├─ Rules (редактор → Sieve)                   ← новое             │
│   ├─ Scheduling Assistant (free/busy сетка)     ← новое             │
│   └─ Import wizard (PST)                        ← новое             │
│  Main: ManageSieve client · FreeBusy service · Meet service ·       │
│        PST importer (imapflow APPEND, tsdav PUT) · updater          │
└──────────────┬──────────────────────────────┬───────────────────────┘
               │ stdin/stdout JSON + SQLite   │ HTTPS / TLS
   ┌───────────▼───────────┐                  │
   │ mailsync (C++, GPL)   │  IMAP/SMTP/CardDAV/CalDAV
   │ 1 процесс на аккаунт  │──────────────────┤
   └───────────────────────┘                  ▼
                                   mailcow: Dovecot · Postfix · SOGo
```

Новые модули — отдельные TypeScript-пакеты в `app/src/` с собственными тестами:

| Модуль | Ответственность | Зависимости |
|---|---|---|
| `managesieve/` | RFC 5804: AUTH PLAIN поверх TLS/STARTTLS, LISTSCRIPTS, GETSCRIPT, PUTSCRIPT, SETACTIVE, CHECKSCRIPT | `tls` из Node |
| `sieve-rules/` | Модель правил Outlook ⇄ Sieve-скрипт. Генерируем скрипт с маркерами-комментариями `# outgluk:rule:<id>`, парсим только свои блоки; чужой скрипт показываем как «raw» | — |
| `freebusy/` | Запрос `.ifb` (VFREEBUSY) и JSON-эндпоинта SOGo для списка адресов и диапазона; нормализация в интервалы | `ical.js` (уже в Mailspring) |
| `meet/` | Google OAuth (PKCE, loopback), `spaces.create`, вставка ссылки в LOCATION/DESCRIPTION/`X-GOOGLE-CONFERENCE`; fallback — ручная ссылка | `googleapis` или fetch |
| `pst-import/` | Чтение PST, маппинг папок, APPEND писем с датой и флагами, дедуп по Message-ID, PUT vCard/ICS, прогресс, возобновление | `pst-extractor`, `imapflow`, `tsdav` |

Импорт PST идёт **на сервер**, а не в локальный кэш: тогда данные видны во всех клиентах и mailsync подхватит их обычным путём.

## 4. Соответствие Outlook → реализация

| Outlook | Как делаем |
|---|---|
| Левая полоса приложений (Почта/Календарь/Люди) | Новый компонент app rail, переключает существующие окна/вкладки Mailspring |
| Папки, Избранное | Mailspring folders + Favorites (есть) |
| Список писем с группировкой «Сегодня/Вчера», превью, отметки | Стилизация thread-list, группировка по дате — новое |
| Область чтения справа/снизу/выкл | Есть layout modes, добавить «снизу» |
| Упрощённая лента (ribbon) | Fluent `Toolbar` + `Menu`, маппинг на команды Mailspring |
| Флаги, категории | IMAP keywords (`$Flagged`, `$label…`) через mailsync labels |
| Правила (Outlook Rules Wizard) | Sieve через ManageSieve: условия from/to/subject/header/size, действия fileinto/addflag/redirect/discard/stop |
| Автоответ «Нет на месте» | Sieve `vacation` в том же скрипте |
| Встреча: участники обяз./необяз., место, повтор, напоминание | Редактор событий Mailspring + расширение формы |
| Помощник планирования | Новая сетка free/busy по SOGo |
| Приглашения, Принять/Под вопросом/Отклонить | RSVP Mailspring; серверная рассылка SOGo |
| Teams-кнопка | «Добавить ссылку на созвон»: ручная ссылка в релизе 1, Google Meet API — когда появится Workspace |
| Общие ящики | Shared namespace Dovecot: mailsync должен показывать папки вне INBOX-namespace; права через IMAP ACL задаются в mailcow/SOGo |
| Делегирование календарей | SOGo публикует чужие календари под `/SOGo/dav/<user>/Calendar/<owner>_<id>/`; Mailspring 1.26 различает owned/shared. Права (просмотр/правка/от имени) — через SOGo ACL; редактор прав в клиенте — отдельная задача |
| Импорт PST | Мастер импорта |
| Поиск | Mailspring (локальный индекс) |
| Подписи, шаблоны | Mailspring signatures |

Серверная рассылка приглашений SOGo против клиентской отправки iMIP в Mailspring: в фазе 0 проверить, не уходят ли приглашения дважды. По умолчанию оставляем серверную (SOGo), клиентскую отключаем для SOGo-аккаунтов.

## 5. Этапы

**Фаза 0 — проверка гипотез (1–2 нед.)**
Собрать Mailspring и Mailspring-Sync из исходников на Windows и macOS. Подключить тестовый mailcow: IMAPS/SMTPS, автообнаружение CalDAV/CardDAV через SOGo, создание события с участниками, RSVP, `.ifb` и JSON free/busy, ManageSieve с mailcow-учёткой. Проверить, что mailsync видит общие папки из shared-namespace Dovecot и общие календари SOGo (чтение и запись). Проверить Fluent UI v9 внутри Mailspring (React 17, LESS vs Griffel). Выход: go/no-go, решение по GPL.

**Фаза 1 — ребрендинг и Fluent-облик (3–4 нед.)**
Переименование, удаление Mailspring ID и облачных фич, своя тема (токены Fluent: шрифт Segoe UI/системный, сетка 8px, акцент `#0F6CBD`, иконки Fluent), app rail, Outlook-раскладка панелей, упрощённая лента, русская локализация проверена.

**Фаза 2 — паритет почты (3–4 нед.)**
Группировка по датам, флаги/категории, область чтения снизу, диалоги на Fluent (компоненты заменяем точечно: кнопки, меню, диалоги, вкладки, аватары). Автонастройка для mailcow (autoconfig/autodiscover XML с сервера).

**Фаза 3 — правила Sieve (2–3 нед.)**
ManageSieve-клиент, модель правил, редактор в стиле Outlook, «Нет на месте», raw-режим для чужих скриптов. Тесты: round-trip сгенерированного скрипта, `CHECKSCRIPT` на сервере.

**Фаза 4 — календарь и встречи (4–6 нед.)**
Редактор встречи в стиле Outlook, помощник планирования (free/busy сетка, подбор времени), статусы ответов участников (PARTSTAT), кнопка ссылки на созвон (ручная; модуль `meet/` за флагом), напоминания, несколько календарей, общие календари SOGo с отображением прав, общие ящики в дереве папок.

**Фаза 5 — импорт PST (2–3 нед.)**
Мастер: выбор файла → карта папок → импорт с прогрессом и возобновлением. Письма через IMAP APPEND с исходной датой и флагами, контакты через CardDAV, события через CalDAV. Дедуп по Message-ID/UID.

**Фаза 6 — упаковка и релиз (2–3 нед.)**
electron-builder, подпись (Apple notarization; Windows — Azure Trusted Signing или EV), собственный сервер обновлений вместо updates.getmailspring.com (electron-updater + статика), crash-репорты, установщики, документация.

Зачем подпись: без неё macOS Gatekeeper блокирует запуск (с 10.15 требуется notarization), встроенный апдейтер macOS отказывается ставить неподписанные обновления, а Windows SmartScreen показывает красное предупреждение на каждом установщике. Для корпоративной раскатки через MDM/Intune предупреждения можно обойти политиками, но автообновления на macOS без подписи не заработают. Стоимость: Apple Developer Program 99 $/год, Azure Trusted Signing около 10 $/мес.

Итого ~4,5–6 мес. одним разработчиком; с дизайнером и вторым разработчиком — 3–4 мес.

## 6. Риски

| Риск | Смягчение |
|---|---|
| Сборка C++-движка на Windows (vcpkg, OpenSSL, libetpan) | Фаза 0 начинается с неё; CI-сборка с первого дня |
| Легаси фронта: React 17, reflux, Slate 0.45 | Не переписывать композер; Fluent внедрять по компонентам; апгрейд React — отдельная задача после релиза |
| Расхождение с upstream Mailspring | Держать движок как git subtree без правок, фронт — как ветку с регулярным rebase по релизам |
| Особенности SOGo (501 на free-busy REPORT, нет копии приглашения в Sent) | Использовать `.ifb`/JSON; копию приглашения класть в Sent самостоятельно |
| Двойные приглашения (SOGo + клиент) | Проверка в фазе 0, переключатель per-account |
| Meet API: нужен Google Workspace и проверка OAuth-приложения | Fallback «вставить ссылку вручную»; альтернатива — Jitsi-ссылка без API |
| `pst-extractor` малоактивен, не читает повреждённые PST | Запасной вариант — `readpst` из libpst как bundled CLI (GPL совместим с нашей GPL) |
| GPLv3 | Решение владельца продукта до фазы 1 |

## 7. Принятые решения и оставшиеся допущения

Решено 2026-10-16:
1. GPLv3 приемлема — идём по варианту A.
2. Google Meet остаётся в плане; Workspace-аккаунта пока нет, в релизе 1 ручная ссылка.
3. Общие ящики и делегирование календарей входят в первый релиз (добавлены в фазы 0 и 4).
4. Сертификаты подписи нужны к фазе 6 (обоснование там же); решение о покупке отложено.

Допущения без ответа:
- Название продукта — рабочее «OutGluk».
- Основной язык интерфейса — русский, английский вторым.
- Один mailcow-сервер, автонастройка по домену.
