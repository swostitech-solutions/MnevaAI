import React from 'react'
import FilesBrowserPage from './FilesBrowserPage'
import { outlookApi } from '../../services/api'

export default function OneDrivePage() {
  return (
    <FilesBrowserPage
      title="OneDrive" icon="🗂️" backTo="/microsoft" backLabel="← Microsoft 365"
      integrationName="Microsoft 365" statusFn={outlookApi.status} connectFn={outlookApi.connect}
      listFn={() => outlookApi.files('all')} emptyBody="Your recently used OneDrive files."
    />
  )
}
