# Task 2: локальная dev-сборка на Linux (prebuilt mailsync)

Дата: 2026-10-16. Ветка `phase0-spike`. Машина: Arch (Omarchy), Hyprland/Wayland, 6 CPU.

## Результаты

| проверка | ожидание | факт | pass/fail |
|---|---|---|---|
| Node | 20 из `.mise.toml` | v20.20.2 (через `mise exec`; системный по умолчанию 26.8.1) | pass |
| `npm install` | код 0, скачан prebuilt | код 0, 4м21с (real); в логе `Downloaded Mailsync prebuilt binary from https://mailspring-builds.s3.amazonaws.com/mailsync/675e9f22/linux/mailsync.tar.gz` | pass |
| `npm start` | окно открывается, нет `Cannot find module` | Electron поднялся (Wayland), `Running database migrations`, `App load time: 829ms`, нет `Cannot find module`, процесс жил до SIGTERM по таймауту 90с. Скриншот окна не снимался, факт показа окна онбординга не подтверждён визуально. Предупреждение: `--ozone-platform=wayland is not compatible with Vulkan` (не критично) | pass (с оговоркой) |
| `npm run typecheck` | код 0 | код 0 | pass |
| `npm run lint:check` | код 0 | код 0 | pass |
| `npm test` | код 0 | зависает после `Running database migrations` (таймаут 500с на Wayland; 300с с `--ozone-platform=x11`; 150с с `--ozone-platform=x11 --disable-gpu`), ни одного результата jasmine, код 124/137 (убит таймаутом). sudo sysctl не применялся. Не проверено под `xvfb-run` + `dbus-launch` как в CI: xvfb не установлен | fail |
| `./app/mailsync --help` | usage | падает: `Error: Could not load libtidy` (нет libtidy.so). Дополнительно `ldd app/mailsync.bin`: `libsasl2.so.2 => not found` | fail |
| `git status` после возврата | без изменений submodule, `app/mailsync*` не видны | `mailsync.off` возвращён в `mailsync`, статус чистый; `app/mailsync`, `app/mailsync.bin`, `app/mailsync.tar.gz` игнорируются git. `npm install` изменил `app/package-lock.json`, откатил `git checkout` | pass |

## Факты

- Версия Node: v20.20.2.
- Время `npm install`: 4м20.9с (user 3м18с).
- Версия prebuilt mailsync: хэш `675e9f22` (из URL скачивания); `--help` на этой машине не отработал, см. ниже.
- Системные зависимости для движка: на машине отсутствуют `libtidy` (пакет `tidy`) и `libsasl2.so.2` (пакет `libsasl`/`cyrus-sasl`). Без них prebuilt mailsync не запустится, то есть синхронизация почты в `npm start` на этой машине не заработает до установки этих пакетов (установка требует sudo, не выполнялась).
- Окружение: в shell агента задана `ELECTRON_RUN_AS_NODE=1`, из-за чего `npm start` падал с `Cannot read properties of undefined (reading 'setName')` (electron запускался как node). Нужно запускать с `env -u ELECTRON_RUN_AS_NODE`. Это артефакт среды агента, не репозитория.
- `npm test` под Wayland/X11 зависает, причина не выяснена; следующий шаг: `dbus-launch xvfb-run -a npm test` после установки `xorg-server-xvfb`, и, если упрётся в sandbox, `sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0`.
- `npm install` сообщил 12 уязвимостей (2 moderate, 10 high) в зависимостях upstream; не исправлялись.
