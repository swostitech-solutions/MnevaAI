'use no memo';
import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';

// Widgets render through react-native-android-widget, not real React Native
// views — no hooks, no View/Text/StyleSheet, only the FlexWidget/TextWidget/
// etc. primitives it exports. All the actual data fetching happens in
// widgetTaskHandler.js before this ever renders; this file is a pure,
// synchronous function of its props.
const ACCENT = '#1F9A5A'; // same green as expo-notifications' icon color (app.json)
const OVERDUE = '#E0546E';
const CARD_BG = '#FFFFFF';
const TEXT = '#111111';
const FAINT = '#6B7280';
const NEXT_BG = '#F4F4F6';
const NEXT_LABEL = '#9AA1AE';

export function PrioritiesWidget({ signedIn = true, count = 0, nextTitle = null, nextTime = null, hasOverdue = false }) {
  if (!signedIn) {
    return (
      <FlexWidget
        clickAction="OPEN_APP"
        accessibilityLabel="Mneva — sign in to see today's priorities"
        style={{
          height: 'match_parent', width: 'match_parent',
          backgroundColor: CARD_BG, borderRadius: 20, padding: 16,
          justifyContent: 'center',
        }}
      >
        <TextWidget text="Mneva" style={{ fontSize: 16, fontWeight: 'bold', color: TEXT }} />
        <TextWidget text="Sign in to see today's priorities" style={{ fontSize: 13, color: FAINT, marginTop: 4 }} />
      </FlexWidget>
    );
  }

  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: 'mneva://priorities' }}
      accessibilityLabel={`Mneva — ${count} thing${count === 1 ? '' : 's'} today${nextTitle ? `, next ${nextTitle}` : ''}`}
      style={{
        height: 'match_parent', width: 'match_parent',
        backgroundColor: CARD_BG, borderRadius: 20, padding: 16,
      }}
    >
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
        <TextWidget text="Mneva" style={{ fontSize: 13, fontWeight: 'bold', color: hasOverdue ? OVERDUE : ACCENT }} />
        <TextWidget text=" · Today" style={{ fontSize: 13, color: FAINT }} />
      </FlexWidget>

      <TextWidget text={String(count)} style={{ fontSize: 40, fontWeight: 'bold', color: TEXT, marginTop: 2 }} />
      <TextWidget text={count === 1 ? 'thing today' : 'things today'} style={{ fontSize: 12, color: FAINT, marginBottom: 10 }} />

      {nextTitle ? (
        <FlexWidget style={{ backgroundColor: NEXT_BG, borderRadius: 12, padding: 10, width: 'match_parent' }}>
          <TextWidget text="NEXT" style={{ fontSize: 10, fontWeight: 'bold', color: NEXT_LABEL, letterSpacing: 1 }} />
          <TextWidget text={nextTitle} style={{ fontSize: 14, fontWeight: 'bold', color: TEXT }} maxLines={1} truncate="END" />
          {nextTime ? <TextWidget text={nextTime} style={{ fontSize: 12, color: FAINT }} /> : null}
        </FlexWidget>
      ) : (
        <TextWidget text="All clear for today" style={{ fontSize: 13, color: FAINT }} />
      )}
    </FlexWidget>
  );
}
