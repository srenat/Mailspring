import { ComponentRegistry } from 'mailspring-exports';
import { FluentToolbarButton } from './fluent-toolbar-button';

export function activate() {
  ComponentRegistry.register(FluentToolbarButton, { role: 'ThreadActionsToolbarButton' });
}

export function deactivate() {
  ComponentRegistry.unregister(FluentToolbarButton);
}
