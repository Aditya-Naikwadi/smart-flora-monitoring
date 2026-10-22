import React, { Component, ErrorInfo, ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spacing, Typography } from '@/constants/theme';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary caught error]:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public override render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Card variant="outlined" style={styles.card}>
            <Text style={styles.icon}>🪴⚠️</Text>
            <Text style={Typography.h3}>
              {this.props.fallbackTitle || 'Something went wrong'}
            </Text>
            <Text style={[Typography.body, styles.message]}>
              {this.state.error?.message || 'An unexpected rendering error occurred.'}
            </Text>
            <Button
              title="Reload View"
              variant="primary"
              size="md"
              onPress={this.handleReset}
              style={styles.button}
            />
          </Card>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
    backgroundColor: '#F8FAFC',
  },
  card: {
    width: '100%',
    padding: Spacing.xl,
    alignItems: 'center',
  },
  icon: {
    fontSize: 40,
    marginBottom: Spacing.md,
  },
  message: {
    color: '#64748B',
    textAlign: 'center',
    marginTop: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  button: {
    minWidth: 160,
  },
});
