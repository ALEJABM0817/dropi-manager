// Shared design tokens — the redesign's visual language in one place.
// Pages import these instead of hardcoding their own accent/card/shadow values,
// so a future palette change happens here, not in 12 files.

export const COLOR = {
  accent: '#4F46E5',
  accentLight: '#6366F1',
  accentBg: '#EEF0FF',
  accentGradient: 'linear-gradient(135deg, #6366F1, #4F46E5)',
  ink: '#0F172A',
  inkSoft: '#1A1D30',
  text: '#3C3F58',
  textMuted: '#8187A3',
  textFaint: '#9499B5',
  border: '#ECEDF5',
  borderSoft: '#F5F6FA',
  bg: '#F4F5F9',
  success: '#16A34A',
  successBg: '#F0FDF4',
  danger: '#DC2626',
  dangerBg: '#FEF2F2',
  warning: '#D97706',
  warningBg: '#FFFBEB',
};

export const FONT_HEADING = "'Lexend', 'Inter', system-ui, sans-serif";

export const RADIUS = { card: 16, pill: 20, control: 10 };

export const SHADOW_CARD = '0 1px 2px rgba(20,20,43,.04)';

// Base building blocks — spread these into a page's own `s` object so the
// per-page style still owns layout (padding, margins) while these own look.
export const card = {
  background: '#fff',
  borderRadius: RADIUS.card,
  border: `1px solid ${COLOR.border}`,
  boxShadow: SHADOW_CARD,
};

export const pageTitle = {
  fontFamily: FONT_HEADING,
  fontSize: 24,
  fontWeight: 700,
  color: COLOR.ink,
  letterSpacing: '-0.4px',
};

export const pageSub = {
  fontSize: 13.5,
  color: COLOR.textMuted,
  marginTop: 2,
};

export const cardTitle = {
  fontFamily: FONT_HEADING,
  fontSize: 14.5,
  fontWeight: 700,
  color: COLOR.inkSoft,
};

export function pill(bg, color) {
  return {
    display: 'inline-block',
    fontSize: 12,
    fontWeight: 700,
    color,
    background: bg,
    padding: '3px 9px',
    borderRadius: RADIUS.pill,
  };
}

export const btnPrimary = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  background: COLOR.accentGradient,
  color: '#fff',
  border: 'none',
  borderRadius: RADIUS.control,
  padding: '10px 18px',
  fontSize: 13.5,
  fontWeight: 700,
  cursor: 'pointer',
  boxShadow: '0 8px 18px -6px rgba(79,70,229,.45)',
};

export const btnSecondary = {
  background: '#fff',
  color: COLOR.text,
  border: `1px solid ${COLOR.border}`,
  borderRadius: RADIUS.control,
  padding: '8px 14px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

export const thStyle = {
  textAlign: 'left',
  padding: '10px 16px',
  fontSize: 11,
  fontWeight: 700,
  color: COLOR.textFaint,
  textTransform: 'uppercase',
  letterSpacing: '0.4px',
  whiteSpace: 'nowrap',
};

export const tdStyle = {
  padding: '13px 16px',
  fontSize: 13.5,
  color: COLOR.inkSoft,
  borderTop: `1px solid ${COLOR.borderSoft}`,
};

export function kpiIcon(bgFrom, bgTo) {
  return {
    width: 38, height: 38, borderRadius: 11,
    background: `linear-gradient(135deg, ${bgFrom}, ${bgTo})`,
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  };
}
