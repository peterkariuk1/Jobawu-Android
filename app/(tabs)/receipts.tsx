/**
 * Receipts Page
 * Search bar + plot cards showing payment summaries.
 * Tap a plot to view its tenants' receipts.
 */
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
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

interface PlotReceiptSummary {
  plot: PlotRecord;
  totalTenants: number;
  tenantsPaid: number;
  tenantsNotPaid: number;
  totalCollected: number;
  totalOutstanding: number;
}

export default function Receipts() {
  const themedColors = useThemedColors();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [plotSummaries, setPlotSummaries] = useState<PlotReceiptSummary[]>([]);
  const [plots, setPlots] = useState<PlotRecord[]>([]);

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  // Build summaries from plots + payments
  const buildSummaries = useCallback(
    (allPlots: PlotRecord[], payments: PaymentRecord[]) => {
      const paymentsByPlot = new Map<string, PaymentRecord[]>();
      payments.forEach(p => {
        const list = paymentsByPlot.get(p.plotId) || [];
        list.push(p);
        paymentsByPlot.set(p.plotId, list);
      });

      return allPlots.map(plot => {
        const plotPayments = paymentsByPlot.get(plot.id!) || [];
        const occupiedUnits = plot.houses.filter(h => h.tenant).length;
        const tenantsPaid = plotPayments.filter(p => p.paid).length;
        const totalCollected = plotPayments.reduce(
          (sum, p) => sum + (p.bank_paid || 0) + (p.cash_paid || 0), 0
        );
        const totalExpected = plotPayments.reduce(
          (sum, p) => sum + (p.total_amount || 0), 0
        );

        return {
          plot,
          totalTenants: occupiedUnits,
          tenantsPaid,
          tenantsNotPaid: occupiedUnits - tenantsPaid,
          totalCollected,
          totalOutstanding: Math.max(0, totalExpected - totalCollected),
        } as PlotReceiptSummary;
      });
    },
    []
  );

  // Load plots once, then subscribe to payments in real-time
  useEffect(() => {
    let unsub: (() => void) | null = null;

    (async () => {
      setLoading(true);
      try {
        const allPlots = await getAllPlots();
        setPlots(allPlots);

        // Real-time listener on payments — fires immediately with current data,
        // then again whenever a payment is created, updated, or deleted.
        unsub = listenToPaymentsForMonth(currentMonth, currentYear, (payments) => {
          const summaries = buildSummaries(allPlots, payments);
          setPlotSummaries(summaries);
          setLoading(false);
        });
      } catch (error) {
        console.error('[Receipts] Error loading data:', error);
        setLoading(false);
      }
    })();

    return () => { unsub?.(); };
  }, [currentMonth, currentYear, buildSummaries]);

  const filteredSummaries = useMemo(() => {
    if (!searchQuery.trim()) return plotSummaries;
    const q = searchQuery.toLowerCase();
    return plotSummaries.filter(s => s.plot.plotName.toLowerCase().includes(q));
  }, [plotSummaries, searchQuery]);

  const navigateToDetail = (plot: PlotRecord) => {
    router.push({
      pathname: '/receipt-detail',
      params: { plotId: plot.id, plotName: plot.plotName },
    });
  };

  const fmt = (n: number) =>
    `KES ${n.toLocaleString('en-KE', { minimumFractionDigits: 0 })}`;

  const renderPlotCard = ({ item }: { item: PlotReceiptSummary }) => (
    <TouchableOpacity
      style={dynamicStyles.plotCard}
      onPress={() => navigateToDetail(item.plot)}
      activeOpacity={0.7}
    >
      <Text style={dynamicStyles.plotName}>{item.plot.plotName}</Text>

      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={dynamicStyles.statValue}>{item.totalTenants}</Text>
          <Text style={dynamicStyles.statLabel}>Tenants</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[dynamicStyles.statValue, { color: themedColors.success }]}>
            {item.tenantsPaid}
          </Text>
          <Text style={dynamicStyles.statLabel}>Paid</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[dynamicStyles.statValue, { color: themedColors.error }]}>
            {item.tenantsNotPaid}
          </Text>
          <Text style={dynamicStyles.statLabel}>Unpaid</Text>
        </View>
      </View>

      <View style={dynamicStyles.divider} />

      <View style={styles.financialRow}>
        <View style={styles.financialItem}>
          <Text style={dynamicStyles.financialLabel}>Collected</Text>
          <Text style={[dynamicStyles.financialValue, { color: themedColors.success }]}>
            {fmt(item.totalCollected)}
          </Text>
        </View>
        <View style={styles.financialItem}>
          <Text style={dynamicStyles.financialLabel}>Outstanding</Text>
          <Text style={[dynamicStyles.financialValue, { color: themedColors.error }]}>
            {fmt(item.totalOutstanding)}
          </Text>
        </View>
      </View>

      <Text style={dynamicStyles.tapHint}>Tap to view receipts →</Text>
    </TouchableOpacity>
  );

  const dynamicStyles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: themedColors.background.primary,
    },
    content: {
      flex: 1,
      padding: spacing.base,
    },
    searchInput: {
      backgroundColor: themedColors.background.card,
      borderWidth: 1,
      borderColor: themedColors.border.main,
      borderRadius: borderRadius.md,
      padding: spacing.md,
      marginBottom: spacing.base,
      fontSize: typography.fontSize.base,
      color: themedColors.text.primary,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: spacing.xl * 2,
    },
    emptyText: {
      fontSize: typography.fontSize.lg,
      color: themedColors.text.secondary,
      textAlign: 'center',
    },
    plotCard: {
      backgroundColor: themedColors.background.card,
      borderRadius: borderRadius.md,
      padding: spacing.base,
      marginBottom: spacing.base,
      borderWidth: 1,
      borderColor: themedColors.border.main,
      ...shadows.sm,
    },
    plotName: {
      fontSize: typography.fontSize.xl,
      fontWeight: typography.fontWeight.bold as any,
      color: themedColors.text.primary,
      marginBottom: spacing.md,
    },
    statValue: {
      fontSize: typography.fontSize['2xl'],
      fontWeight: typography.fontWeight.bold as any,
      color: themedColors.text.primary,
    },
    statLabel: {
      fontSize: typography.fontSize.xs,
      color: themedColors.text.tertiary,
      marginTop: spacing.xs,
    },
    divider: {
      height: 1,
      backgroundColor: themedColors.border.light,
      marginVertical: spacing.md,
    },
    financialLabel: {
      fontSize: typography.fontSize.xs,
      color: themedColors.text.tertiary,
      marginBottom: spacing.xs,
    },
    financialValue: {
      fontSize: typography.fontSize.lg,
      fontWeight: typography.fontWeight.bold as any,
    },
    tapHint: {
      fontSize: typography.fontSize.xs,
      color: themedColors.text.placeholder,
      textAlign: 'right',
      marginTop: spacing.md,
    },
  }), [themedColors]);

  return (
    <SafeAreaView style={dynamicStyles.container} edges={['top']}>
      <PageHeader
        title="Receipts"
        onMenuPress={() => setSidebarOpen(true)}
      />

      <View style={dynamicStyles.content}>
        <TextInput
          style={dynamicStyles.searchInput}
          placeholder="Search by plot name..."
          placeholderTextColor={themedColors.text.placeholder}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />

        {loading ? (
          <View style={dynamicStyles.loadingContainer}>
            <ActivityIndicator size="large" color={themedColors.primary[500]} />
            <Text style={dynamicStyles.emptyText}>Loading receipts...</Text>
          </View>
        ) : filteredSummaries.length === 0 ? (
          <View style={dynamicStyles.emptyContainer}>
            <Text style={dynamicStyles.emptyText}>
              {searchQuery ? 'No plots found matching your search' : 'No plots registered yet'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredSummaries}
            renderItem={renderPlotCard}
            keyExtractor={item => item.plot.id || ''}
            contentContainerStyle={{ paddingBottom: spacing.xl }}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  financialRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  financialItem: {
    flex: 1,
  },
});
