import React from 'react';
import { apiFetch } from '../api/client';
import { getStoredAuth } from '../storage/auth';
import { PrioritiesWidget } from './PrioritiesWidget';

function fmtTime(d) {
  return new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// Mirrors the "today" slice of Priorities.js's own logic (pendingTasks +
// todayReminders), simplified for a glanceable widget: a count, and the
// single nearest undone thing today. Runs inside the task handler (a
// Headless JS task, same mechanism RN background push handlers use), not
// inside the widget component itself — the component must stay a pure,
// synchronous function of its props.
async function buildWidgetProps() {
  const { token } = await getStoredAuth();
  if (!token) return { signedIn: false };

  try {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);

    const [tasks, meetings, doneRes] = await Promise.all([
      apiFetch('/api/tasks'),
      apiFetch('/api/calendar/meetings'),
      apiFetch('/api/tasks/meeting-done'),
    ]);

    const doneIds = new Set(doneRes?.ids || []);
    const pendingTasks = (Array.isArray(tasks) ? tasks : [])
      .filter(t => t.status === 'PENDING' && !t.title?.startsWith('meeting_done:'));

    const allItems = Array.isArray(meetings) ? meetings : (meetings?.meetings || []);
    const todayItems = allItems
      .filter(m => {
        const d = new Date(m.start);
        return !isNaN(d.getTime()) && d >= todayStart && d <= todayEnd && !doneIds.has(m.id);
      })
      .sort((a, b) => new Date(a.start) - new Date(b.start));

    const count = pendingTasks.length + todayItems.length;
    const hasOverdue = todayItems.some(m => new Date(m.start).getTime() < Date.now());

    // Prefer the next item still ahead of now; if everything today has
    // already passed, fall back to the earliest one so there's still
    // something concrete to show instead of going blank.
    const nextItem = todayItems.find(m => new Date(m.start).getTime() >= Date.now()) || todayItems[0];

    let nextTitle = null;
    let nextTime = null;
    if (nextItem) {
      nextTitle = nextItem.title;
      nextTime = fmtTime(nextItem.start);
    } else if (pendingTasks[0]) {
      nextTitle = pendingTasks[0].title;
    }

    return { signedIn: true, count, nextTitle, nextTime, hasOverdue };
  } catch {
    // Offline/expired-session/etc — show an empty-but-not-broken widget
    // rather than crashing the background task.
    return { signedIn: true, count: 0, nextTitle: null, nextTime: null, hasOverdue: false };
  }
}

const nameToWidget = {
  Priorities: PrioritiesWidget,
};

export async function widgetTaskHandler(props) {
  const Widget = nameToWidget[props.widgetInfo.widgetName];
  if (!Widget) return;

  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      const data = await buildWidgetProps();
      props.renderWidget(<Widget {...data} />);
      break;
    }
    // WIDGET_CLICK is never fired for this widget — every clickable area
    // uses OPEN_APP/OPEN_URI, which Android's own widget host handles
    // natively without calling back into this handler. WIDGET_DELETED
    // needs no cleanup — there's no per-widget state kept outside what the
    // next ADDED/UPDATE call would already overwrite.
    default:
      break;
  }
}
