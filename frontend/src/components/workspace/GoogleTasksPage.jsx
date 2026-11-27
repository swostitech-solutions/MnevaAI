import React from 'react'
import TasksListPage from './TasksListPage'
import { gtasksApi } from '../../services/api'

export default function GoogleTasksPage() {
  return (
    <TasksListPage
      title="Google Tasks" icon="✅" backTo="/workspace" backLabel="← Workspace"
      integrationName="Google Tasks" statusFn={gtasksApi.status} connectFn={gtasksApi.connect}
      listFn={gtasksApi.list} completeFn={gtasksApi.complete} queryKey={['googleTasksList']}
    />
  )
}
