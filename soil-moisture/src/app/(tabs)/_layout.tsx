import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Tabs } from 'expo-router';
import { useAlertsQuery } from '@/features/alerts/useAlerts';
import { usePushNotifications } from '@/features/alerts/usePushNotifications';
import { useAppTheme } from '@/hooks/useAppTheme';

function TabIcon({ icon, focused }: { icon: string; focused: boolean }) {
  return (
    <View style={[styles.iconContainer, focused && styles.iconFocused]}>
      <Text style={styles.iconText}>{icon}</Text>
    </View>
  );
}

export default function TabsLayout() {
  const { colors } = useAppTheme();
  usePushNotifications();
  const { data: alerts } = useAlertsQuery();
  const unreadCount = (alerts || []).filter((a) => !a.acknowledged).length;

  return (
    <Tabs
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.surface,
        },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.tabBarBorder,
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 88 : 64,
          paddingBottom: Platform.OS === 'ios' ? 28 : 10,
          paddingTop: 8,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'My Plants',
          headerTitle: 'Smart Flora',
          tabBarLabel: 'Plants',
          tabBarIcon: ({ focused }) => <TabIcon icon="🪴" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: 'Alerts',
          headerTitle: 'Plant Health Alerts',
          tabBarLabel: 'Alerts',
          tabBarIcon: ({ focused }) => <TabIcon icon="🔔" focused={focused} />,
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          headerTitle: 'Preferences',
          tabBarLabel: 'Settings',
          tabBarIcon: ({ focused }) => <TabIcon icon="⚙️" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  iconFocused: {
    transform: [{ scale: 1.15 }],
  },
  iconText: {
    fontSize: 20,
  },
});
