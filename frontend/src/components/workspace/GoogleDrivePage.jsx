import React from 'react'
import FilesBrowserPage from './FilesBrowserPage'
import { gdriveApi } from '../../services/api'

export default function GoogleDrivePage() {
  return (
    <FilesBrowserPage
      title="Google Drive" icon="🗂️" backTo="/workspace" backLabel="← Workspace"
      integrationName="Google Drive" statusFn={gdriveApi.status} connectFn={gdriveApi.connect}
      listFn={() => gdriveApi.files('drive')} emptyBody="All your recent Drive files, of every type."
    />
  )
}
