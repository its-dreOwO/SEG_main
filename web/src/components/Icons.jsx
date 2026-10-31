// Flat inline icons, stroke only. Decorative by default (aria-hidden).
const base = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'square', strokeLinejoin: 'miter', 'aria-hidden': true, focusable: false };
const make = (d) => function Icon({ size = 22, ...rest }) {
  return <svg {...base} width={size} height={size} {...rest}>{d}</svg>;
};

export const SearchIcon = make(<><circle cx="11" cy="11" r="6.5" /><path d="m16 16 5 5" /></>);
export const UserIcon = make(<><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" /></>);
export const CartIcon = make(<><path d="M3 4h3l2.4 11h10.2L21 7H7" /><circle cx="9.5" cy="19.5" r="1.3" /><circle cx="17.5" cy="19.5" r="1.3" /></>);
export const HeadsetIcon = make(<><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><rect x="3" y="13" width="4" height="6" /><rect x="17" y="13" width="4" height="6" /></>);
export const MenuIcon = make(<path d="M3 6h18M3 12h18M3 18h18" />);
export const CloseIcon = make(<path d="m5 5 14 14M19 5 5 19" />);
export const ChevronDown = make(<path d="m6 9 6 6 6-6" />);
export const TruckIcon = make(<><path d="M2 6h12v10H2zM14 10h4l3 3v3h-7" /><circle cx="6.5" cy="18" r="1.6" /><circle cx="17.5" cy="18" r="1.6" /></>);
export const ReturnIcon = make(<><path d="M4 12a8 8 0 1 0 3-6.2" /><path d="M4 4v5h5" /></>);
export const CashIcon = make(<><rect x="2.5" y="6" width="19" height="12" /><circle cx="12" cy="12" r="2.8" /></>);
export const HelpIcon = make(<><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><path d="M20 15v2a3 3 0 0 1-3 3h-4" /><rect x="3" y="13" width="4" height="6" /></>);
export const HeartIcon = make(<path d="M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z" />);
export const TagIcon = make(<><path d="M3 12V3h9l9 9-9 9z" /><circle cx="7.5" cy="7.5" r="1.2" /></>);

export function Logo({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" fill="#E8175D" />
      <path d="M18 4 8 18h7l-2 10 11-15h-7z" fill="#fff" />
    </svg>
  );
}

export function StarShape({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m12 2.5 2.9 6.2 6.6.8-4.9 4.6 1.3 6.7L12 17.5l-5.9 3.3 1.3-6.7L2.5 9.5l6.6-.8z" fill="currentColor" />
    </svg>
  );
}
