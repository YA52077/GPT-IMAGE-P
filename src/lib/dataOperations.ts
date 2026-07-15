import type { AgentConversation, TaskRecord } from '../types'

export function hasActiveDataOperations(tasks: TaskRecord[], agentConversations: AgentConversation[]) {
  return tasks.some((task) => task.status === 'running' || task.customRecoverable)
    || agentConversations.some((conversation) => conversation.rounds.some((round) => round.status === 'running'))
}
