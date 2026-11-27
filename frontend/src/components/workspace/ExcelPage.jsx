import React from 'react'
import FilesBrowserPage from './FilesBrowserPage'
import { outlookApi } from '../../services/api'

export default function ExcelPage() {
  return (
    <FilesBrowserPage
      title="Excel" icon="📗" backTo="/microsoft" backLabel="← Microsoft 365"
      integrationName="Microsoft 365" statusFn={outlookApi.status} connectFn={outlookApi.connect}
      listFn={() => outlookApi.files('excel')} emptyBody="Recently used .xlsx files on OneDrive."
    />
  )
}
