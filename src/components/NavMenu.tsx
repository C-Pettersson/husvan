'use client'

import { useId, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Divider, IconButton, Menu, MenuItem } from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import { useSignOut } from './SignOutButton'

export type NavLink = { href: string; label: string }

// The header's links behind one button, for screens too narrow to show them
// in a row.
export default function NavMenu({ links }: { links: NavLink[] }) {
  const t = useTranslations('nav')
  const pathname = usePathname()
  const signOut = useSignOut()
  const menuId = useId()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const open = anchor !== null
  const close = () => setAnchor(null)

  return (
    <>
      <IconButton
        color="inherit"
        edge="end"
        aria-label={t('menu')}
        aria-haspopup="true"
        aria-controls={open ? menuId : undefined}
        aria-expanded={open ? 'true' : undefined}
        onClick={(event) => setAnchor(event.currentTarget)}
        sx={{ width: 44, height: 44 }}
      >
        <MenuIcon />
      </IconButton>
      <Menu
        id={menuId}
        anchorEl={anchor}
        open={open}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { minWidth: 200 } } }}
      >
        {links.map((link) => (
          <MenuItem
            key={link.href}
            component="a"
            href={link.href}
            selected={pathname === link.href || pathname.startsWith(`${link.href}/`)}
            onClick={close}
            sx={{ minHeight: 48 }}
          >
            {link.label}
          </MenuItem>
        ))}
        <Divider />
        <MenuItem
          onClick={() => {
            close()
            void signOut()
          }}
          sx={{ minHeight: 48 }}
        >
          {t('signOut')}
        </MenuItem>
      </Menu>
    </>
  )
}
