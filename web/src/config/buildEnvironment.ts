const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

export function assertProductionBackendUrl(mode: string, value: string | undefined): void {
  if (mode !== 'production') return;

  const configuredValue = value?.trim();
  if (!configuredValue) {
    throw new Error('VITE_BACKEND_URL is required for production builds.');
  }

  let backendUrl: URL;
  try {
    backendUrl = new URL(configuredValue);
  } catch {
    throw new Error('VITE_BACKEND_URL must be a valid HTTPS URL for production builds.');
  }

  const hostname = backendUrl.hostname.toLowerCase();
  if (
    backendUrl.protocol !== 'https:'
    || LOCAL_HOSTNAMES.has(hostname)
    || hostname.endsWith('.localhost')
  ) {
    throw new Error('VITE_BACKEND_URL must be a public HTTPS URL for production builds.');
  }
}
