/**
 * Dashboard - Main home screen
 * Displays recent payments, totals, and key metrics
 */
import { collection, getDocs, limit, orderBy, query, Timestamp, where } from 'firebase/firestore';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Sidebar } from '../../components/sidebar';
import { borderRadius, colors, shadows, spacing, typography } from '../../constants/design';
import { db } from '../../firebaseConfig.ts';

interface Payment {
  id: string;
  tenantName: string;
  plotName: string;
  houseNo: string;
  amount: number;
  date: Date;
  status: 'confirmed' | 'pending';
}

interface DashboardMetrics {
  totalCollected: number;
  totalDue: number;
  paymentsCount: number;
}

export default function Dashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [recentPayments, setRecentPayments] = useState<Payment[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalCollected: 0,
    totalDue: 0,
    paymentsCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboardData = useCallback(async () => {
    try {
      // Fetch recent payments from transactions collection
      const transactionsRef = collection(db, 'transactions');
      const q = query(
        transactionsRef,
        orderBy('createdAt', 'desc'),
        limit(10)
      );
      
      const snapshot = await getDocs(q);
      const payments: Payment[] = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          tenantName: data.senderName || 'Unknown',
          plotName: data.plotName || 'Unassigned',
          houseNo: data.houseNo || '-',
          amount: data.amount || 0,
          date: data.createdAt?.toDate?.() || new Date(),
          status: data.status === 'confirmed' ? 'confirmed' : 'pending',
        };
      });
      
      setRecentPayments(payments);
      
      // Calculate metrics for current month
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      
      const monthQuery = query(
        transactionsRef,
        where('createdAt', '>=', Timestamp.fromDate(monthStart))
      );
      
      const monthSnapshot = await getDocs(monthQuery);
      let totalCollected = 0;
      monthSnapshot.forEach(doc => {
        totalCollected += doc.data().amount || 0;
      });
      
      // TODO: Calculate totalDue from plots collection when available
      setMetrics({
        totalCollected,
        totalDue: 0, // Will be calculated from plots
        paymentsCount: monthSnapshot.size,
      });
      
    } catch (error) {
      console.log('[Dashboard] Error fetching data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchDashboardData();
  }, [fetchDashboardData]);

  const formatCurrency = (amount: number) => {
    return `KES ${amount.toLocaleString('en-KE', { minimumFractionDigits: 0 })}`;
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-KE', {
      day: 'numeric',
      month: 'short',
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.menuButton}
          onPress={() => setSidebarOpen(true)}
          activeOpacity={0.7}
        >
          <View style={styles.menuIcon}>
            <View style={styles.menuLine} />
            <View style={styles.menuLine} />
            <View style={styles.menuLine} />
          </View>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Dashboard</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[500]} />
          <Text style={styles.loadingText}>Loading dashboard...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary[500]}
            />
          }
        >
          {/* Metrics Cards */}
          <View style={styles.metricsRow}>
            <View style={[styles.metricCard, styles.metricCardPrimary]}>
              <Text style={styles.metricLabel}>Collected This Month</Text>
              <Text style={styles.metricValuePrimary}>
                {formatCurrency(metrics.totalCollected)}
              </Text>
              <Text style={styles.metricSubtext}>
                {metrics.paymentsCount} payment{metrics.paymentsCount !== 1 ? 's' : ''}
              </Text>
            </View>
          </View>

          <View style={styles.metricsRow}>
            <View style={[styles.metricCard, styles.metricCardHalf]}>
              <Text style={styles.metricLabelSmall}>Total Due</Text>
              <Text style={styles.metricValue}>
                {formatCurrency(metrics.totalDue)}
              </Text>
            </View>
            <View style={[styles.metricCard, styles.metricCardHalf]}>
              <Text style={styles.metricLabelSmall}>Outstanding</Text>
              <Text style={[styles.metricValue, styles.metricValueWarning]}>
                {formatCurrency(Math.max(0, metrics.totalDue - metrics.totalCollected))}
              </Text>
            </View>
          </View>

          {/* Recent Payments */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Payments</Text>
          </View>

          {recentPayments.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={styles.emptyTitle}>No payments yet</Text>
              <Text style={styles.emptySubtext}>
                Payments will appear here once tenants start paying
              </Text>
            </View>
          ) : (
            recentPayments.map((payment) => (
              <View key={payment.id} style={styles.paymentCard}>
                <View style={styles.paymentLeft}>
                  <Text style={styles.paymentTenant}>{payment.tenantName}</Text>
                  <Text style={styles.paymentPlot}>
                    {payment.plotName} • {payment.houseNo}
                  </Text>
                </View>
                <View style={styles.paymentRight}>
                  <Text style={styles.paymentAmount}>
                    {formatCurrency(payment.amount)}
                  </Text>
                  <Text style={styles.paymentDate}>{formatDate(payment.date)}</Text>
                </View>
              </View>
            ))
          )}

          <View style={styles.bottomSpacer} />
        </ScrollView>
      )}

      {/* Sidebar */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.secondary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.background.primary,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[200],
  },
  menuButton: {
    padding: spacing.sm,
    marginLeft: -spacing.sm,
  },
  menuIcon: {
    width: 24,
    height: 18,
    justifyContent: 'space-between',
  },
  menuLine: {
    width: 24,
    height: 2,
    backgroundColor: colors.neutral[700],
    borderRadius: 1,
  },
  headerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.neutral[900],
    letterSpacing: -0.3,
  },
  headerSpacer: {
    width: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: typography.fontSize.base,
    color: colors.neutral[500],
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.base,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  metricCard: {
    backgroundColor: colors.background.primary,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    ...shadows.sm,
  },
  metricCardPrimary: {
    flex: 1,
    backgroundColor: colors.primary[500],
  },
  metricCardHalf: {
    flex: 1,
  },
  metricLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: 'rgba(255, 255, 255, 0.85)',
    marginBottom: spacing.xs,
  },
  metricLabelSmall: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.neutral[500],
    marginBottom: spacing.xs,
  },
  metricValuePrimary: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  metricValue: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.neutral[900],
    letterSpacing: -0.3,
  },
  metricValueWarning: {
    color: colors.warning.dark,
  },
  metricSubtext: {
    fontSize: typography.fontSize.sm,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: spacing.xs,
  },
  sectionHeader: {
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.neutral[900],
  },
  paymentCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.background.primary,
    borderRadius: borderRadius.md,
    padding: spacing.base,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  paymentLeft: {
    flex: 1,
  },
  paymentTenant: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
    color: colors.neutral[900],
  },
  paymentPlot: {
    fontSize: typography.fontSize.sm,
    color: colors.neutral[500],
    marginTop: 2,
  },
  paymentRight: {
    alignItems: 'flex-end',
  },
  paymentAmount: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.success.dark,
  },
  paymentDate: {
    fontSize: typography.fontSize.xs,
    color: colors.neutral[400],
    marginTop: 2,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing['3xl'],
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.medium,
    color: colors.neutral[700],
    marginBottom: spacing.xs,
  },
  emptySubtext: {
    fontSize: typography.fontSize.sm,
    color: colors.neutral[500],
    textAlign: 'center',
    maxWidth: 240,
  },
  bottomSpacer: {
    height: spacing['2xl'],
  },
});


