import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { hasOnboarded } from './lib/onboarding';

// Bootstrap entry: mounts the root component. No business logic lives here, so
// it is excluded from coverage (see docs/adr/0002). The first-run onboarding
// tour shows only when the user has not seen it before.
const target = document.getElementById('app');
const app = mount(App, {
  target: target as HTMLElement,
  props: { onboarded: hasOnboarded(window.localStorage) }
});

export default app;
