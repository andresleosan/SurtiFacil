import type { SVGProps } from 'react';

export type IconName =
  | 'home'
  | 'cart'
  | 'box'
  | 'receipt'
  | 'users'
  | 'truck'
  | 'clipboard'
  | 'refresh'
  | 'chart'
  | 'percent'
  | 'chat'
  | 'logout'
  | 'more'
  | 'search'
  | 'scan'
  | 'plus'
  | 'minus'
  | 'trash'
  | 'pencil'
  | 'close'
  | 'chevron-right'
  | 'chevron-down'
  | 'chevron-left'
  | 'chevron-up'
  | 'menu'
  | 'alert'
  | 'check'
  | 'wallet'
  | 'settings'
  | 'store'
  | 'sparkles'
  | 'tag'
  | 'eye'
  | 'eye-off'
  | 'grid'
  | 'list'
  | 'package'
  | 'external-link';

const PATHS: Record<IconName, string> = {
  home: 'M3 11.5 12 4l9 7.5M5 10v10h5v-6h4v6h5V10',
  cart: 'M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.6a1 1 0 0 0 1-.8L21 8H6.2M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm9 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  box: 'M21 8 12 3 3 8v8l9 5 9-5V8Zm-9 5L3 8m9 5 9-5m-9 5v8',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2V3Zm3 5h6M9 12h6M9 16h4',
  users: 'M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1m18 0v-1a4 4 0 0 0-3-3.9M14.5 4.3a4 4 0 0 1 0 7.4M13.5 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  truck: 'M3 6h11v10H3V6Zm11 4h4l3 3v3h-7v-6ZM7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm10 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  clipboard: 'M9 4h6v3H9V4Zm-3 2h2m8 0h2a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1M9 12h6M9 16h6',
  refresh: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5',
  chart: 'M4 20V10m6 10V4m6 16v-7m4 7H2',
  percent: 'M19 5 5 19M7.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm9 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
  chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12Z',
  logout: 'M15 17l5-5-5-5m5 5H9m3 9H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7',
  more: 'M6 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm6 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm6 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  search: 'M21 21l-4.3-4.3M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z',
  scan: 'M4 8V5a1 1 0 0 1 1-1h3m8 0h3a1 1 0 0 1 1 1v3m0 8v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3m4-6v6m3-6v6m3-6v6m3-6v6',
  plus: 'M12 5v14m-7-7h14',
  minus: 'M5 12h14',
  trash: 'M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3',
  pencil: 'M4 20h4l10.5-10.5a2 2 0 0 0-4-4L4 16v4Zm10-14 4 4',
  close: 'M6 6l12 12M18 6 6 18',
  'chevron-right': 'M9 6l6 6-6 6',
  'chevron-down': 'M6 9l6 6 6-6',
  'chevron-left': 'M15 6l-6 6 6 6',
  'chevron-up': 'M18 15l-6-6-6 6',
  menu: 'M4 7h16M4 12h16M4 17h16',
  alert: 'M12 9v4m0 4h.01M10.3 3.9 2.5 18a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  check: 'M5 13l4 4L19 7',
  wallet: 'M3 7a2 2 0 0 1 2-2h12v3M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2Zm13 6h2',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-2.1a1 1 0 0 0 .2-1.1l-1.3-2.3a1 1 0 0 1 .2-1.2l1.9-1.5a1 1 0 0 0 .3-1.2l-2-3.5a1 1 0 0 0-1.1-.5l-2.3.8a1 1 0 0 1-1.2-.5L13.3 1a1 1 0 0 0-1.2-.7h-4a1 1 0 0 0-1 .7L6.3 3.4a1 1 0 0 1-1.2.5l-2.3-.8a1 1 0 0 0-1.1.5l-2 3.5a1 1 0 0 0 .3 1.2l1.9 1.5a1 1 0 0 1 .2 1.2L.8 13.8a1 1 0 0 0 .2 1.1l2 3.5a1 1 0 0 0 1.1.5l2.3-.8a1 1 0 0 1 1.2.5l.8 2.4a1 1 0 0 0 1 .7h4a1 1 0 0 0 1-.7l.8-2.4a1 1 0 0 1 1.2-.5l2.3.8a1 1 0 0 0 1.1-.5l2-3.5Z',
  store: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Zm6 13V12h6v10',
  sparkles: 'M12 2v4m0 12v4M2 12h4m12 0h4m-3.5-6.5-2.8 2.8m-9.4 9.4-2.8 2.8m0-15 2.8 2.8m9.4 9.4 2.8 2.8',
  tag: 'M20.6 13 11 3.4A2 2 0 0 0 9.6 3H4a1 1 0 0 0-1 1v5.6a2 2 0 0 0 .6 1.4L13 20.6a2 2 0 0 0 2.8 0l4.8-4.8a2 2 0 0 0 0-2.8ZM7 7h.01',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  'eye-off': 'M9.9 4.2A10.6 10.6 0 0 1 12 4c6.4 0 10 7 10 7a18.3 18.3 0 0 1-4 5.3M1 1l22 22M14.1 14.1a3 3 0 0 1-4.2-4.2',
  grid: 'M3 3h7v7H3V3Zm11 0h7v7h-7V3Zm0 11h7v7h-7v-7ZM3 14h7v7H3v-7Z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  package: 'M16.5 9.4 7.55 4.24M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16ZM3.27 6.96 12 12.01l8.73-5.05M12 22.08V12',
  'external-link': 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6m4-3h6v6m-11 5L21 3',
};

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
}

/** Icono SVG en línea (trazo), heredando `currentColor`. Decorativo por defecto. */
export function Icon({ name, size = 22, className, ...rest }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
