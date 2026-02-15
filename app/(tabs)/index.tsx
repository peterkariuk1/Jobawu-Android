/**
 * Dashboard - Main home screen
 * Displays real-time payment metrics, property stats, and recent payments.
 */
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PageHeader } from '../../components/page-header';
import { Sidebar } from '../../components/sidebar';
import { borderRadius, shadows, spacing, typography } from '../../constants/design';
import { useThemedColors } from '../../hooks/use-themed-colors';
import {
  getAllPlots,
  listenToPaymentsForMonth,
  PaymentRecord,
  PlotRecord,
} from '../../services/firestore-service';

export default function Dashboard() {
  const themedColors = useThemedColors();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Data
  const [plots, setPlots] = useState<PlotRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  // ── Load plots + subscribe to payments ─────────────────────
  useEffect(() => {
    let unsub: (() => void) | null = null;

    (async () => {
      setLoading(true);
      try {
        const allPlots = await getAllPlots();
        setPlots(allPlots);

        unsub = listenToPaymentsForMonth(currentMonth, currentYear, (pmts) => {
          setPayments(pmts);
          setLoading(false);
          setRefreshing(false);
        });
      } catch (error) {
        console.log('[Dashboard] Error loading data:', error);
        setLoading(false);
        setRefreshing(false);
      }
    })();

    return () => { unsub?.(); };
  }, [currentMonth, currentYear]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      const allPlots = await getAllPlots();
      setPlots(allPlots);
    } catch (e) {
      console.log('[Dashboard] refresh error:', e);
    }
    // payments auto-refresh via listener; refreshing flag cleared in listener callback
  };

  // ── Derived metrics ────────────────────────────────────────
  const propertyStats = useMemo(() => {
    let totalUnits = 0;
    let totalOccupied = 0;
    let totalCollectable = 0;

    plots.forEach(p => {
      totalUnits += p.houses.length;
      p.houses.forEach(h => {
        if (h.tenant) {
          totalOccupied++;
          totalCollectable += (h.baseRent || 0) + (h.garbageFees || 0);
        }
      });
    });

    return {
      totalPlots: plots.length,
      totalUnits,
      totalOccupied,
      totalVacant: totalUnits - totalOccupied,
      totalCollectable,
    };
  }, [plots]);

  const paymentStats = useMemo(() => {
    const totalCollected = payments.reduce(
      (s, p) => s + (p.bank_paid || 0) + (p.cash_paid || 0), 0
    );
    const totalBilled = payments.reduce(
      (s, p) => s + (p.total_amount || 0), 0
    );
    const paidCount = payments.filter(p => p.paid).length;

    // Build a set of invoiced tenants keyed by plotId|houseNo
    const invoicedKeys = new Set<string>();
    payments.forEach(p => invoicedKeys.add(`${p.plotId}|${p.houseNo}`));

    // Pending from invoiced but unpaid tenants (balance > 0)
    let pendingFees = payments.reduce((s, p) => {
      const bal = p.balance ?? 0;
      return s + (bal > 0 ? bal : 0);
    }, 0);

    // Pending from non-invoiced occupied tenants (rent + garbage)
    plots.forEach(plot => {
      plot.houses.forEach(h => {
        if (h.tenant && !invoicedKeys.has(`${plot.id}|${h.houseNo}`)) {
          pendingFees += (h.baseRent || 0) + (h.garbageFees || 0);
        }
      });
    });

    return { totalCollected, totalBilled, pendingFees, paymentsCount: payments.length, paidCount };
  }, [payments, plots]);

  // Recent payments sorted by createdAt desc, filtered by search
  const recentPayments = useMemo(() => {
    let sorted = [...payments].sort((a, b) => {
      const aTime = a.createdAt?.toDate?.() || a.createdAt || 0;
      const bTime = b.createdAt?.toDate?.() || b.createdAt || 0;
      return (bTime instanceof Date ? bTime.getTime() : Number(bTime))
           - (aTime instanceof Date ? aTime.getTime() : Number(aTime));
    });

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      sorted = sorted.filter(p =>
        p.name?.toLowerCase().includes(q) ||
        p.plotName?.toLowerCase().includes(q) ||
        p.houseNo?.toLowerCase().includes(q) ||
        p.trans_id?.toLowerCase().includes(q) ||
        p.tenantPhone?.includes(q) ||
        p.month_paid?.toLowerCase().includes(q)
      );
    }

    return sorted.slice(0, 20);
  }, [payments, searchQuery]);

  // ── Helpers ────────────────────────────────────────────────
  const fmt = (n: number) =>
    `KES ${n.toLocaleString('en-KE', { minimumFractionDigits: 0 })}`;

  const formatDate = (p: PaymentRecord) => {
    if (p.createdAt?.toDate) return p.createdAt.toDate().toLocaleDateString('en-KE', { day: 'numeric', month: 'short' });
    return '-';
  };

  // ── Dynamic styles ─────────────────────────────────────────
  const ds = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: themedColors.background.secondary,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingText: {
      marginTop: spacing.md,
      fontSize: typography.fontSize.base,
      color: themedColors.text.secondary,
    },
    scrollView: { flex: 1 },
    scrollContent: { padding: spacing.base, paddingBottom: spacing['2xl'] },
    // ── Collection hero card ───
    heroCard: {
      backgroundColor: themedColors.primary[500],
      borderRadius: borderRadius.lg,
      padding: spacing.lg,
      marginBottom: spacing.md,
      ...shadows.md,
    },
    heroLabel: {
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.medium as any,
      color: 'rgba(255,255,255,0.85)',
      marginBottom: spacing.xs,
    },
    heroValue: {
      fontSize: typography.fontSize['3xl'] ?? 30,
      fontWeight: typography.fontWeight.bold as any,
      color: '#FFFFFF',
      letterSpacing: -0.5,
    },
    heroSub: {
      fontSize: typography.fontSize.sm,
      color: 'rgba(255,255,255,0.7)',
      marginTop: spacing.xs,
    },
    // ── Two-column stat cards ───
    statsRow: {
      flexDirection: 'row',
      gap: spacing.md,
      marginBottom: spacing.md,
    },
    statCard: {
      flex: 1,
      backgroundColor: themedColors.background.card,
      borderRadius: borderRadius.lg,
      padding: spacing.base,
      ...shadows.sm,
    },
    statLabel: {
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.medium as any,
      color: themedColors.text.tertiary,
      marginBottom: spacing.xs,
    },
    statValue: {
      fontSize: typography.fontSize.xl,
      fontWeight: typography.fontWeight.bold as any,
      color: themedColors.text.primary,
    },
    // ── Search bar ───
    searchInput: {
      backgroundColor: themedColors.background.card,
      borderWidth: 1,
      borderColor: themedColors.border.main,
      borderRadius: borderRadius.md,
      padding: spacing.md,
      fontSize: typography.fontSize.base,
      color: themedColors.text.primary,
      marginBottom: spacing.md,
    },
    // ── Payments list ───
    sectionTitle: {
      fontSize: typography.fontSize.md,
      fontWeight: typography.fontWeight.semibold as any,
      color: themedColors.text.primary,
      marginBottom: spacing.md,
      marginTop: spacing.lg,
    },
    paymentCard: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: themedColors.background.card,
      borderRadius: borderRadius.md,
      padding: spacing.base,
      marginBottom: spacing.sm,
      ...shadows.sm,
    },
    paymentTenant: {
      fontSize: typography.fontSize.base,
      fontWeight: typography.fontWeight.medium as any,
      color: themedColors.text.primary,
    },
    paymentPlot: {
      fontSize: typography.fontSize.sm,
      color: themedColors.text.secondary,
      marginTop: 2,
    },
    paymentAmount: {
      fontSize: typography.fontSize.base,
      fontWeight: typography.fontWeight.semibold as any,
      color: themedColors.success,
    },
    paymentDate: {
      fontSize: typography.fontSize.xs,
      color: themedColors.text.tertiary,
      marginTop: 2,
    },
    // ── Status badge ───
    badge: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: borderRadius.full,
      marginTop: 4,
      alignSelf: 'flex-end',
    },
    badgeText: {
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.semibold as any,
    },
    // ── Empty state ───
    emptyState: {
      alignItems: 'center',
      paddingVertical: spacing['3xl'],
    },
    emptyIcon: { fontSize: 48, marginBottom: spacing.md },
    emptyTitle: {
      fontSize: typography.fontSize.md,
      fontWeight: typography.fontWeight.medium as any,
      color: themedColors.text.secondary,
      marginBottom: spacing.xs,
    },
    emptySubtext: {
      fontSize: typography.fontSize.sm,
      color: themedColors.text.tertiary,
      textAlign: 'center',
      maxWidth: 240,
    },
  }), [themedColors]);

  // ── Render ─────────────────────────────────────────────────
  return (
    <SafeAreaView style={ds.container}>
      <PageHeader title="Dashboard" onMenuPress={() => setSidebarOpen(true)} />

      {loading ? (
        <View style={ds.loadingContainer}>
          <ActivityIndicator size="large" color={themedColors.primary[500]} />
          <Text style={ds.loadingText}>Loading dashboard...</Text>
        </View>
      ) : (
        <ScrollView
          style={ds.scrollView}
          contentContainerStyle={ds.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={themedColors.primary[500]}
            />
          }
        >
          {/* ── Hero: Collected This Month ─── */}
          <TouchableOpacity
            style={ds.heroCard}
            activeOpacity={0.8}
            onPress={() => router.push('/(tabs)/payments')}
          >
            <Text style={ds.heroLabel}>Collected This Month</Text>
            <Text style={ds.heroValue}>{fmt(paymentStats.totalCollected)}</Text>
            <Text style={ds.heroSub}>
              {paymentStats.paidCount} paid of {paymentStats.paymentsCount} bill{paymentStats.paymentsCount !== 1 ? 's' : ''} • Tap for details →
            </Text>
          </TouchableOpacity>

          {/* ── Row: Total Collectable / Outstanding ─── */}
          <View style={ds.statsRow}>
            <TouchableOpacity
              style={ds.statCard}
              activeOpacity={0.7}
              onPress={() => router.push('/(tabs)/payments')}
            >
              <Text style={ds.statLabel}>Total Collectable</Text>
              <Text style={ds.statValue}>{fmt(propertyStats.totalCollectable)}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={ds.statCard}
              activeOpacity={0.7}
              onPress={() => router.push('/(tabs)/payments')}
            >
              <Text style={ds.statLabel}>Pending Fees</Text>
              <Text style={[ds.statValue, { color: paymentStats.pendingFees > 0 ? themedColors.error : themedColors.success }]}>
                {fmt(paymentStats.pendingFees)}
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── Row: Plots / Units / Vacants ─── */}
          <View style={ds.statsRow}>
            <TouchableOpacity
              style={ds.statCard}
              activeOpacity={0.7}
              onPress={() => router.push('/(tabs)/tenants')}
            >
              <Text style={ds.statLabel}>Plots</Text>
              <Text style={ds.statValue}>{propertyStats.totalPlots}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={ds.statCard}
              activeOpacity={0.7}
              onPress={() => router.push('/(tabs)/tenants')}
            >
              <Text style={ds.statLabel}>Total Units</Text>
              <Text style={ds.statValue}>{propertyStats.totalUnits}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={ds.statCard}
              activeOpacity={0.7}
              onPress={() => router.push('/(tabs)/tenants')}
            >
              <Text style={ds.statLabel}>Vacant</Text>
              <Text style={[ds.statValue, { color: propertyStats.totalVacant > 0 ? themedColors.error : themedColors.success }]}>
                {propertyStats.totalVacant}
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── Recent Payments ─── */}
          <Text style={ds.sectionTitle}>Recent Payments</Text>

          <TextInput
            style={ds.searchInput}
            placeholder="Search by name, plot, house, trans ID..."
            placeholderTextColor={themedColors.text.placeholder}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />

          {recentPayments.length === 0 ? (
            <View style={ds.emptyState}>
              <Text style={ds.emptyIcon}>📭</Text>
              <Text style={ds.emptyTitle}>
                {searchQuery ? 'No matching payments' : 'No payments yet'}
              </Text>
              <Text style={ds.emptySubtext}>
                {searchQuery
                  ? 'Try a different search term'
                  : 'Payments will appear here once tenants start paying'}
              </Text>
            </View>
          ) : (
            recentPayments.map((p) => (
              <View key={p.id} style={ds.paymentCard}>
                <View style={{ flex: 1 }}>
                  <Text style={ds.paymentTenant}>{p.name}</Text>
                  <Text style={ds.paymentPlot}>
                    {p.plotName} • House {p.houseNo}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={ds.paymentAmount}>{fmt((p.bank_paid || 0) + (p.cash_paid || 0))}</Text>
                  <Text style={ds.paymentDate}>{formatDate(p)}</Text>
                  <View style={[
                    ds.badge,
                    { backgroundColor: p.paid ? 'rgba(22,163,74,0.12)' : 'rgba(220,38,38,0.12)' },
                  ]}>
                    <Text style={[ds.badgeText, { color: p.paid ? '#16a34a' : '#dc2626' }]}>
                      {p.paid ? 'Paid' : 'Pending'}
                    </Text>
                  </View>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    </SafeAreaView>
  );
}