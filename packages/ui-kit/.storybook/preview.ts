import type { Preview } from '@storybook/svelte';
import '../styles.css';

/** Paint the chosen theme on the document so stories preview Onionskin/Carbon. */
function applyTheme(theme: string): void {
  document.documentElement.setAttribute('data-theme', theme);
  document.body.style.background = 'var(--bg)';
  document.body.style.color = 'var(--fg)';
}

const preview: Preview = {
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } }
  },
  globalTypes: {
    theme: {
      description: 'Galley theme',
      defaultValue: 'onionskin',
      toolbar: {
        title: 'Theme',
        icon: 'paintbrush',
        items: [
          { value: 'onionskin', title: 'Onionskin' },
          { value: 'carbon', title: 'Carbon' }
        ],
        dynamicTitle: true
      }
    }
  },
  decorators: [
    (story, context) => {
      applyTheme(context.globals.theme);
      return story();
    }
  ]
};

export default preview;
