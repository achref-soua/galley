import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';

// Bootstrap entry: mounts the root component. No business logic lives here, so
// it is excluded from coverage (see docs/adr/0002).
const target = document.getElementById('app');
const app = mount(App, { target: target as HTMLElement });

export default app;
