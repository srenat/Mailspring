import React from 'react';
import { FluentProvider, webLightTheme, Button } from '@fluentui/react-components';
import { MailAddRegular } from '@fluentui/react-icons';
import { Actions } from 'mailspring-exports';

export function FluentToolbarButton() {
  return (
    <FluentProvider theme={webLightTheme}>
      <Button
        appearance="primary"
        icon={<MailAddRegular />}
        data-testid="fluent-compose"
        onClick={() => Actions.composeNewBlankDraft()}
      >
        Новое письмо
      </Button>
    </FluentProvider>
  );
}

FluentToolbarButton.displayName = 'FluentToolbarButton';
