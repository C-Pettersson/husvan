'use client'

import { useTranslations } from 'next-intl'
import {
  Alert,
  Chip,
  CircularProgress,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Typography,
} from '@mui/material'
import { trpc } from '@/lib/trpc'

export default function HouseList() {
  const t = useTranslations()
  const houses = trpc.house.list.useQuery()

  if (houses.isPending) return <CircularProgress />
  if (houses.isError)
    return <Alert severity="error">{t('error.generic')}</Alert>
  if (houses.data.length === 0) {
    return <Typography color="text.secondary">{t('houses.empty')}</Typography>
  }

  return (
    <>
      <Typography color="text.secondary">
        {t('houses.count', { count: houses.data.length })}
      </Typography>
      <List>
        {houses.data.map((house) => (
          <ListItem key={house.id} divider disablePadding>
            <ListItemButton href={`/houses/${house.id}`}>
              <ListItemText primary={house.address} />
              <Chip
                size="small"
                label={t(`house.status.${house.status.toLowerCase()}`)}
              />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </>
  )
}
