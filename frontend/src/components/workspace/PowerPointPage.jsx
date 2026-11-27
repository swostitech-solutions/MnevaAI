import React from 'react'
import FilesBrowserPage from './FilesBrowserPage'
import { outlookApi } from '../../services/api'

export default function PowerPointPage() {
  return (
    <FilesBrowserPage
      title="PowerPoint" icon="📙" backTo="/microsoft" backLabel="← Microsoft 365"
      integrationName="Microsoft 365" statusFn={outlookApi.status} connectFn={outlookApi.connect}
      listFn={() => outlookApi.files('powerpoint')} emptyBody="Recently used .pptx files on OneDrive."
    />
  )
}
