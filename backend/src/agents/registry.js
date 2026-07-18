const registry = new Map()

export function registerAgent(agent) {
  if (!agent || !agent.name) return null
  registry.set(agent.name, {
    ...agent,
    registeredAt: new Date().toISOString(),
  })
  return registry.get(agent.name)
}

export function getAgent(name) {
  return registry.get(name) || null
}

export function listAgents() {
  return Array.from(registry.values())
}

export function getAgentRegistrySnapshot() {
  return {
    total: registry.size,
    agents: listAgents(),
  }
}

registerAgent({
  name: 'planner',
  type: 'PLANNER',
  description: 'Breaks goals into executable steps',
})
registerAgent({
  name: 'memory',
  type: 'MEMORY',
  description: 'Stores and retrieves semantic context',
})
registerAgent({
  name: 'researcher',
  type: 'RESEARCHER',
  description: 'Finds information and synthesizes answers',
})
registerAgent({
  name: 'finance',
  type: 'FINANCE',
  description: 'Supports financial planning and payments',
})
registerAgent({
  name: 'health',
  type: 'HEALTH',
  description: 'Handles health and wellbeing related tasks',
})

export const agentRegistry = {
  get: getAgent,
  list: listAgents,
  register: registerAgent,
  snapshot: getAgentRegistrySnapshot,
}

export const plannerAgent = {
  name: 'planner',
  type: 'PLANNER',
  description: 'Decomposes a request into actionable steps and priorities.',
  async run(input = {}) {
    const goal = String(input.goal || input.message || '')
    return {
      plan: goal ? goal.split(/\s+/).slice(0, 8) : [],
      summary: goal || 'No goal provided',
    }
  },
}

export const researcherAgent = {
  name: 'researcher',
  type: 'RESEARCHER',
  description: 'Explores context and generates evidence-based summaries.',
  async run(input = {}) {
    const query = String(input.query || input.message || '')
    return {
      query,
      findings: query ? [{ snippet: query }] : [],
      summary: query || 'No search query provided',
    }
  },
}

registerAgent(plannerAgent)
registerAgent(researcherAgent)
