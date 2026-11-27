import React from 'react'
import TasksListPage from './TasksListPage'
import { outlookApi } from '../../services/api'

export default function MicrosoftTodoPage() {
  return (
    <TasksListPage
      title="Microsoft To Do" icon="✅" backTo="/microsoft" backLabel="← Microsoft 365"
      integrationName="Microsoft 365" statusFn={outlookApi.status} connectFn={outlookApi.connect}
      listFn={outlookApi.tasks} completeFn={outlookApi.completeTask} queryKey={['msTodoList']}
    />
  )
}
