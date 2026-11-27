import React from 'react'
import FilesBrowserPage from './FilesBrowserPage'
import { gdriveApi } from '../../services/api'

export default function SheetsPage() {
  return (
    <FilesBrowserPage
      title="Sheets" icon="📊" backTo="/workspace" backLabel="← Workspace"
      integrationName="Google Drive" statusFn={gdriveApi.status} connectFn={gdriveApi.connect}
      listFn={() => gdriveApi.files('sheets')} emptyBody="Google Sheets you own or have opened recently will show up here."
    />
  )
}
