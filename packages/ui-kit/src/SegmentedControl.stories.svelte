<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import SegmentedControl from './SegmentedControl.svelte';

  const themeOptions = [
    { value: 'onionskin', label: 'Onionskin' },
    { value: 'carbon', label: 'Carbon' },
    { value: 'system', label: 'Match system' }
  ];

  const { Story } = defineMeta({
    title: 'Primitives/SegmentedControl',
    component: SegmentedControl
  });
</script>

<Story name="Theme switcher">
  <SegmentedControl options={themeOptions} value="onionskin" ariaLabel="Theme" />
</Story>
