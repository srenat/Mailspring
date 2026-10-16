# Task 2: локальная dev-сборка на Linux (prebuilt mailsync)

Дата: 2026-10-16. Ветка `phase0-spike`. Машина: Arch (Omarchy), Hyprland/Wayland, 6 CPU.

## Результаты

| проверка | ожидание | факт | pass/fail |
|---|---|---|---|
| Node | 20 из `.mise.toml` | v20.20.2 (через `mise exec`; системный по умолчанию 26.8.1) | pass |
| `npm install` | код 0, скачан prebuilt | код 0, 4м21с (real); в логе `Downloaded Mailsync prebuilt binary from https://mailspring-builds.s3.amazonaws.com/mailsync/675e9f22/linux/mailsync.tar.gz` | pass |
| `npm start` | окно онбординга открывается, нет `Cannot find module` | Электрон поднялся (Wayland), `Running database migrations`, `App load time: 829ms`, нет `Cannot find module`, процесс жил до SIGTERM по таймауту 90с. Окно НЕ подтверждено визуально: `grim` и `hyprctl` из среды агента зависают (>120с), скриншот получить не удалось. Предупреждение: `--ozone-platform=wayland is not compatible with Vulkan` | partial / не подтверждено визуально |
| `npm run typecheck` | код 0 | код 0 | pass |
| `npm run lint:check` | код 0 | код 0 | pass |
| `npm test` | код 0 | зависает после `Running database migrations`, ни одного результата jasmine. Wayland: таймаут 500с, код 124; `--ozone-platform=x11`: таймаут 300с, код 137 (KILL); `--ozone-platform=x11 --disable-gpu`: 150с, код 137. sudo sysctl не применялся. Под `dbus-launch xvfb-run -a` как в CI не проверялось: xvfb не установлен | fail |
| `./app/mailsync --help` | usage | падает: `Error: Could not load libtidy` (нет libtidy.so). `ldd app/mailsync.bin`: `libsasl2.so.2 => not found` | fail |

## Факты

- Версия Node: v20.20.2.
- Время `npm install`: 4м20.9с (user 3м18с).
- Версия prebuilt mailsync: `675e9f22` (из URL скачивания); это совпадает с коммитом сабмодуля (`git -C mailsync rev-parse --short=8 HEAD` = `675e9f22`). `--help` на этой машине не отработал, см. ниже.
- Гигиена: `mailsync.off` возвращён в `mailsync`, `git status` чистый, `app/mailsync`, `app/mailsync.bin`, `app/mailsync.tar.gz` игнорируются git; `app/package-lock.json`, изменённый `npm install`, откатил `git checkout`.
- Системные зависимости для движка (проверено `pacman -Si`, `pacman -Q`; sudo не запускался):
  - `libtidy`: пакет `tidy` (extra), не установлен. Нужен для запуска mailsync.
  - `libsasl2.so.2`: пакет `libsasl` (core) УЖЕ установлен (2.1.28-5), но даёт только `libsasl2.so.3`. Бинарь prebuilt собран под `.so.2`, поэтому установка пакетов не поможет: нужен либо симлинк/совместимая сборка `.so.2`, либо пересборка движка из сабмодуля (Task 5). Это возможный блокер для prebuilt на Arch; `pacman -F` недоступен без `-Fy` (требует sudo).
  - Команда для того, что решается пакетами: `sudo pacman -S --needed tidy xorg-server-xvfb` (xvfb нужен для `xvfb-run` в `npm test`; `libsasl` уже есть). После этого повторить `./app/mailsync --help`; если останется `libsasl2.so.2 not found`, см. выше.
- Окружение: в shell агента задана `ELECTRON_RUN_AS_NODE=1`, из-за чего `npm start` падал с `Cannot read properties of undefined (reading 'setName')` (electron запускался как node). Нужно запускать с `env -u ELECTRON_RUN_AS_NODE`. Это артефакт среды агента, не репозитория.
- `npm test` под Wayland/X11 зависает, причина не выяснена; следующий шаг: `dbus-launch xvfb-run -a npm test` после установки `xorg-server-xvfb`, и, если упрётся в sandbox, `sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0`.
- `npm install` сообщил 12 уязвимостей (2 moderate, 10 high) в зависимостях upstream; не исправлялись.
