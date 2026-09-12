// Classifies a ledger entry's tool name into a product domain and (where the
// tool represents a genuine AI-initiated action) an autonomy stage. This is
// static, tool-keyed metadata rather than anything computed from live
// approval state — there is no pre-execution approval gate in this codebase
// today, so autonomyStage describes the *design intent* for that class of
// action (e.g. "payments are meant to require approval"), not a per-instance
// outcome. Direct user edits (Family CRUD, Security & Trust settings changes)
// get autonomyStage: null — they are not AI autonomy at all, just audited
// user actions, and labeling them with an autonomy stage would overclaim.

export const DOMAIN_LABELS = {
  communications: 'Communications',
  finance: 'Finance',
  lifeops: 'Life Operations',
  health: 'Health',
  family: 'Family',
  security: 'Security & Trust',
  workspace: 'Google Workspace',
}

export const AUTONOMY_STAGES = {
  proposed: 'Proposed',
  notified_after_acting: 'Notified after acting',
  trusted_automation: 'Trusted automation',
  fully_autonomous: 'Fully autonomous',
}

const TOOL_META = {
  initiate_payment: { domain: 'finance', autonomyStage: 'proposed' },
  send_email: { domain: 'communications', autonomyStage: 'notified_after_acting' },
  schedule_event: { domain: 'lifeops', autonomyStage: 'notified_after_acting' },
  set_reminder: { domain: 'lifeops', autonomyStage: 'trusted_automation' },
  book_cab: { domain: 'lifeops', autonomyStage: 'fully_autonomous' },
  order_food: { domain: 'lifeops', autonomyStage: 'fully_autonomous' },
  book_flight: { domain: 'lifeops', autonomyStage: 'proposed' },
  book_hotel: { domain: 'lifeops', autonomyStage: 'proposed' },
  parent_medication_created: { domain: 'family', autonomyStage: null },
  parent_medication_updated: { domain: 'family', autonomyStage: null },
  parent_medication_deleted: { domain: 'family', autonomyStage: null },
  family_task_created: { domain: 'family', autonomyStage: null },
  family_task_status_changed: { domain: 'family', autonomyStage: null },
  family_task_deleted: { domain: 'family', autonomyStage: null },
  pet_created: { domain: 'family', autonomyStage: null },
  pet_updated: { domain: 'family', autonomyStage: null },
  pet_deleted: { domain: 'family', autonomyStage: null },
  pet_reminder_created: { domain: 'family', autonomyStage: null },
  family_item_created: { domain: 'family', autonomyStage: null },
  family_item_updated: { domain: 'family', autonomyStage: null },
  family_item_deleted: { domain: 'family', autonomyStage: null },
  health_data_synced: { domain: 'health', autonomyStage: null },
  health_log_updated: { domain: 'health', autonomyStage: null },
  health_log_deleted: { domain: 'health', autonomyStage: null },
  trust_level_changed: { domain: 'security', autonomyStage: null },
  autonomy_toggle_changed: { domain: 'security', autonomyStage: null },
  account_connected: { domain: 'security', autonomyStage: null },
  account_disconnected: { domain: 'security', autonomyStage: null },
  google_task_completed: { domain: 'workspace', autonomyStage: null },
}

export function getToolMeta(tool) {
  return TOOL_META[tool] || { domain: null, autonomyStage: null }
}
