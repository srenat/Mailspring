# Task 4: CI-сборка движка Mailspring-Sync (linux / macOS / windows)

Форк: https://github.com/srenat/Mailspring-Sync, ветка `phase0-ci`, коммит `ea0b3a9` (от 675e9f2).

## Runs

| workflow | run id |
|---|---|
| Build and Upload Artifacts (linux, linux-arm64, macOS + test-* дистрибутивы) | 38890565099 |
| Build Windows (+ test-windows) | 38890565088 |

Windows собирается отдельным workflow (`build-windows.yml`), поэтому run-id два.

## Проверки

| проверка | ожидание | факт | pass/fail |
|---|---|---|---|
| build ubuntu-22.04 | зелёный | зелёный, 4m54s | pass |
| build ubuntu-24.04-arm | зелёный | зелёный, 4m02s (упоминался в брифе как 4-й джоб, это linux-arm64) | pass |
| build macos-latest | зелёный, universal | зелёный, 5m22s; arch `x86_64 arm64`; ad-hoc подпись (SIGN_BUILD=false, build.sh это поддерживает) | pass |
| macOS `Run install-check` | `install-check passed` | `✓ mailsync install-check passed on macOS` | pass |
| build-windows windows-2022 | зелёный | зелёный, 26m10s (холодный кеш vcpkg) | pass |
| test-windows install-check | passed | `OK mailsync install-check passed on Windows`, 10s | pass |
| test-fedora/ubuntu/arch/opensuse (13 джобов) | зелёные | все зелёные, 20-52s | pass |
| артефакт `mailsync-linux` | есть, mailsync.tar.gz | есть | pass |
| артефакт `mailsync-macos` | есть, mailsync.tar.gz | есть (в upstream macOS-артефакт GitHub не выгружался, добавлено) | pass |
| артефакт `mailsync-windows` | есть, mailsync.tar.gz | есть (upstream называл `win-ia32-mailsync`, переименовано) | pass |
| секреты/S3/codesign на phase0-ci | не запускаются | Setup AWS CLI, S3 upload, Deploy to S3, import-codesign-certs под `refs/heads/master`, пропущены | pass |

## Размеры

| артефакт (tar.gz) | архив | бинарь внутри |
|---|---|---|
| mailsync-linux (x86_64) | 18.7 МБ | mailsync.bin 49.7 МБ + wrapper mailsync |
| mailsync-linux-arm64 | 19.2 МБ | mailsync.bin 51.5 МБ + wrapper |
| mailsync-macos (universal) | 4.6 МБ | mailsync 17.4 МБ |
| mailsync-windows (ia32) | 30.4 МБ | mailsync.exe 2.6 МБ + DLL |

Скачано в `/tmp/claude-1000/-home-sysadm1n-Work-OutGluk/e599632f-5d20-4b3d-a98a-59b84e8dfea4/scratchpad/mailsync-artifacts/{linux-run,win-run}`.

## Изменения workflow

- триггер push/pull_request: добавлен `phase0-ci` в оба файла;
- build.yml: шаги копирования/выгрузки артефакта больше не ограничены Linux (macOS теперь тоже выгружает `mailsync-macos`), retention 1 -> 7 дней;
- build-windows.yml: имя артефакта `win-ia32-mailsync` -> `mailsync-windows` (и в upload, и в test-windows download), retention 7 дней.

Замечание: для Task 5 артефакты хранятся 7 дней (до 2026-10-23), после этого нужен перезапуск.
