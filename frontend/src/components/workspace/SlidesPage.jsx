import React from 'react'
import FilesBrowserPage from './FilesBrowserPage'
import { gdriveApi } from '../../services/api'

export default function SlidesPage() {
  return (
    <FilesBrowserPage
      title="Slides" icon="📽️" backTo="/workspace" backLabel="← Workspace"
      integrationName="Google Drive" statusFn={gdriveApi.status} connectFn={gdriveApi.connect}
      listFn={() => gdriveApi.files('slides')} emptyBody="Google Slides you own or have opened recently will show up here."
    />
  )
}
