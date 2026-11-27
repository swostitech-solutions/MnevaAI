import React from 'react'
import FilesBrowserPage from './FilesBrowserPage'
import { outlookApi } from '../../services/api'

export default function WordPage() {
  return (
    <FilesBrowserPage
      title="Word" icon="📘" backTo="/microsoft" backLabel="← Microsoft 365"
      integrationName="Microsoft 365" statusFn={outlookApi.status} connectFn={outlookApi.connect}
      listFn={() => outlookApi.files('word')} emptyBody="Recently used .docx files on OneDrive."
    />
  )
}
