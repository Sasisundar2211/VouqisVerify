import type { Metadata } from 'next'
import { DesignPartnerForm } from './design-partner-form'

export const metadata: Metadata = {
  title: 'Design Partner — Vouqis',
  description:
    'Join the Vouqis early access program. We work with a small number of teams shipping AI changes to production every week.',
}

export default function DesignPartnerPage() {
  return <DesignPartnerForm />
}
