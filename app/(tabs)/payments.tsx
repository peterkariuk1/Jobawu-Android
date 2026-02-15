/**
 * Payments Page
 * View plots with payment summaries, search, and navigate to detail
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
    getAllPaymentsForMonth,
    getAllPlots,
    PaymentRecord,
    PlotRecord,
} from '../../services/firestore-service';

interface PlotPaymentSummary {
  plot: PlotRecord;
  totalTenants: number;
  tenantsPaid: number;
  tenantsNotPaid: number;
  totalCashPaid: number;
  totalYetToBePaid: number;
  totalExpected: number;
}

export default function Payments() {
  const themedColors = useThemedColors();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [plotSummaries, setPlotSummaries] = useState<PlotPaymentSummary[]>([]);

  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [plots, payments] = await Promise.all([
        getAllPlots(),
        getAllPaymentsForMonth(currentMonth, currentYear),
      ]);

      // Group payments by plotId
      const paymentsByPlot = new Map<string, PaymentRecord[]>();
      payments.forEach(p => {
        const list = paymentsByPlot.get(p.plotId) || [];
        list.push(p);
        paymentsByPlot.set(p.plotId, list);
      });

      const summaries: PlotPaymentSummary[] = plots.map(plot => {
        const plotPayments = paymentsByPlot.get(plot.id!) || [];
        const occupiedUnits = plot.houses.filter(h => h.tenant).length;
        const tenantsPaid = plotPayments.filter(p => p.paid).length;
        const totalCashPaid = plotPayments.reduce(
          (sum, p) => sum + (p.bank_paid || 0) + (p.cash_paid || 0), 0
        );
        const totalExpected = plotPayments.reduce(
          (sum, p) => sum + (p.total_amount || 0), 0
        );
        const totalYetToBePaid = totalExpected - totalCashPaid;

        return {
          plot,
          totalTenants: occupiedUnits,
          tenantsPaid,
          tenantsNotPaid: occupiedUnits - tenantsPaid,
          totalCashPaid,
          totalYetToBePaid: Math.max(0, totalYetToBePaid),
          totalExpected,
        };
      });

      setPlotSummaries(summaries);
    } catch (error) {
      console.error('[Payments] Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }, [currentMonth, currentYear]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredSummaries = useMemo(() => {
    if (!searchQuery.trim()) return plotSummaries;
    const lowerQuery = searchQuery.toLowerCase();
    return plotSummaries.filter(s =>
      s.plot.plotName.toLowerCase().includes(lowerQuery)
    );
  }, [plotSummaries, searchQuery]);

  const navigateToDetail = (plot: PlotRecord) => {
    router.push({
      pathname: '/(tabs)/payment-detail',
      params: { plotId: plot.id, plotName: plot.plotName },
    });
  };

  const formatCurrency = (amount: number) =>
    `KES ${amount.toLocaleString('en-KE', { minimumFractionDigits: 0 })}`;

  const renderPlotCard = ({ item }: { item: PlotPaymentSummary }) => (
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
          <Text style={dynamicStyles.statLabel}>Not Paid</Text>
        </View>
      </View>

      <View style={dynamicStyles.divider} />

      <View style={styles.financialRow}>
        <View style={styles.financialItem}>
          <Text style={dynamicStyles.financialLabel}>Collected</Text>
          <Text style={[dynamicStyles.financialValue, { color: themedColors.success }]}>
            {formatCurrency(item.totalCashPaid)}
          </Text>
        </View>
        <View style={styles.financialItem}>
          <Text style={dynamicStyles.financialLabel}>Outstanding</Text>
          <Text style={[dynamicStyles.financialValue, { color: themedColors.error }]}>
            {formatCurrency(item.totalYetToBePaid)}
          </Text>
        </View>
      </View>

      <Text style={dynamicStyles.tapHint}>Tap to view details →</Text>
    </TouchableOpacity>
  );

  // Dynamic styles
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
        title="Payments"
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
            <Text style={dynamicStyles.emptyText}>Loading payments...</Text>
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
