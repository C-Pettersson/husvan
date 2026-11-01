import { Box, SvgIcon, type SvgIconProps } from '@mui/material'

// A house whose base is a bar chart of yearly cost: two ordinary years cut
// out of the wall and one tall year, when a large part is replaced, that is
// also the door. The same drawing is src/app/icon.svg, the favicon.
export function LogoMark(props: SvgIconProps) {
  return (
    <SvgIcon viewBox="0 0 32 32" {...props}>
      <path
        fill="#2f5d50"
        fillRule="evenodd"
        d="M5 28a1 1 0 0 1-1-1V14.6a1 1 0 0 1 .36-.77l11-9.3a1 1 0 0 1 1.28 0l11 9.3a1 1 0 0 1 .36.77V27a1 1 0 0 1-1 1zM8 18v6h4v-6zm12-2v8h4v-8z"
      />
      <rect fill="#b5663c" x="14" y="12" width="4" height="12" />
    </SvgIcon>
  )
}

export default function Logo() {
  return (
    <Box
      component="span"
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}
    >
      <LogoMark sx={{ fontSize: 32 }} />
      <Box
        component="span"
        sx={{
          color: 'primary.main',
          fontSize: '1.375rem',
          fontWeight: 700,
          letterSpacing: '-0.01em',
          lineHeight: 1,
        }}
      >
        Husvan
      </Box>
    </Box>
  )
}
