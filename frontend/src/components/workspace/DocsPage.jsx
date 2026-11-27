import React from 'react'
import FilesBrowserPage from './FilesBrowserPage'
import { gdriveApi } from '../../services/api'

export default function DocsPage() {
  return (
    <FilesBrowserPage
      title="Docs" icon="📄" backTo="/workspace" backLabel="← Workspace"
      integrationName="Google Drive" statusFn={gdriveApi.status} connectFn={gdriveApi.connect}
      listFn={() => gdriveApi.files('docs')} emptyBody="Google Docs you own or have opened recently will show up here."
    />
  )
}
