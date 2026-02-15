/**
 * Receipt Detail Page
 * Shows all tenants for a plot with payment cards.
 * Paid/overpaid tenants sorted to top with print enabled.
 * Search by tenant name, trans ID, date. Month/year filter.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ReceiptPrinter } from '../../components/receipt-printer';
import { borderRadius, shadows, spacing, typography } from '../../constants/design';
import { useThemedColors } from '../../hooks/use-themed-colors';
import {
    getPaymentsForPlotMonth,
    PaymentRecord,
} from '../../services/firestore-service';

// ─── Constants ───────────────────────────────────────────────
const MONTH_OPTIONS = [
  { label: 'Jan', value: 1 },
  { label: 'Feb', value: 2 },
  { label: 'Mar', value: 3 },
  { label: 'Apr', value: 4 },
  { label: 'May', value: 5 },
  { label: 'Jun', value: 6 },
  { label: 'Jul', value: 7 },
  { label: 'Aug', value: 8 },
  { label: 'Sep', value: 9 },
  { label: 'Oct', value: 10 },
  { label: 'Nov', value: 11 },
  { label: 'Dec', value: 12 },
];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function ReceiptDetail() {
  const themedColors = useThemedColors();
  const router = useRouter();
  const { plotId, plotName } = useLocalSearchParams<{ plotId: string; plotName: string }>();

  // State
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());

  // Receipt printer modal
  const [receiptVisible, setReceiptVisible] = useState(false);
  const [receiptPayment, setReceiptPayment] = useState<PaymentRecord | null>(null);

  // Data loading
  const loadData = useCallback(async () => {
    if (!plotId) return;
    setLoading(true);
    try {
      const data = await getPaymentsForPlotMonth(plotId, selectedMonth, selectedYear);
      setPayments(data);
    } catch (error) {
      console.error('[ReceiptDetail] loadData error:', error);
    } finally {
      setLoading(false);
    }
  }, [plotId, selectedMonth, selectedYear]);

  useEffect(() => { loadData(); }, [loadData]);

  // Helpers
  const fmt = (n: number) =>
    `KES ${n.toLocaleString('en-KE', { minimumFractionDigits: 0 })}`;

  const monthLabel = MONTH_NAMES[selectedMonth - 1];

  const formatPhoneDisplay = (phone?: string | null): string => {
    if (!phone) return '-';
    if (phone.startsWith('254') && phone.length >= 12) {
      return '0' + phone.substring(3);
    }
    return phone;
  };

  // Sort: paid/overpaid first, then unpaid
  const sortedAndFiltered = useMemo(() => {
    let list = [...payments];

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(p =>
        p.name?.toLowerCase().includes(q) ||
        p.houseNo?.toLowerCase().includes(q) ||
        p.trans_id?.toLowerCase().includes(q) ||
        p.tenantPhone?.includes(q) ||
        p.month_paid?.toLowerCase().includes(q)
      );
    }

    // Sort: paid first
    list.sort((a, b) => {
      const aPaid = a.paid || ((a.bank_paid || 0) + (a.cash_paid || 0) >= a.total_amount);
      const bPaid = b.paid || ((b.bank_paid || 0) + (b.cash_paid || 0) >= b.total_amount);
      if (aPaid && !bPaid) return -1;
      if (!aPaid && bPaid) return 1;
      return 0;
    });

    return list;
  }, [payments, searchQuery]);

  const openReceipt = (p: PaymentRecord) => {
    setReceiptPayment(p);
    setReceiptVisible(true);
  };

  // ── Render month/year selector ─────────────────────────────
  const renderMonthYearSelector = () => (
    <View style={styles.monthYearSection}>
      <View style={dynamicStyles.monthGrid}>
        {MONTH_OPTIONS.map(opt => {
          const selected = opt.value === selectedMonth;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[dynamicStyles.monthChip, selected && dynamicStyles.monthChipActive]}
              onPress={() => setSelectedMonth(opt.value)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  dynamicStyles.monthChipText,
                  selected && dynamicStyles.monthChipTextActive,
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.yearRow}>
        <Text style={dynamicStyles.yearLabel}>Year:</Text>
        <TextInput
          style={dynamicStyles.yearInput}
          value={selectedYear.toString()}
          onChangeText={v => {
            const n = parseInt(v);
            if (!isNaN(n)) setSelectedYear(n);
          }}
          keyboardType="number-pad"
          maxLength={4}
        />
      </View>
    </View>
  );

  // ── Dynamic styles ─────────────────────────────────────────
  const dynamicStyles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: themedColors.background.primary,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.base,
      paddingVertical: spacing.md,
      backgroundColor: themedColors.background.primary,
      borderBottomWidth: 1,
      borderBottomColor: themedColors.border.main,
    },
    backBtn: { paddingRight: spacing.md },
    backText: {
      fontSize: typography.fontSize.xl,
      color: themedColors.text.secondary,
    },
    headerTitle: {
      fontSize: typography.fontSize.lg,
      fontWeight: typography.fontWeight.semibold as any,
      color: themedColors.text.primary,
      flex: 1,
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
    monthGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    monthChip: {
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
      borderRadius: borderRadius.sm,
      borderWidth: 1,
      borderColor: themedColors.border.main,
      backgroundColor: themedColors.background.card,
      minWidth: 50,
      alignItems: 'center',
    },
    monthChipActive: {
      backgroundColor: themedColors.primary[500],
      borderColor: themedColors.primary[500],
    },
    monthChipText: {
      fontSize: typography.fontSize.sm,
      color: themedColors.text.secondary,
      fontWeight: typography.fontWeight.medium as any,
    },
    monthChipTextActive: { color: '#FFFFFF' },
    yearLabel: {
      fontSize: typography.fontSize.sm,
      color: themedColors.text.secondary,
      marginRight: spacing.sm,
    },
    yearInput: {
      backgroundColor: themedColors.background.card,
      borderWidth: 1,
      borderColor: themedColors.border.main,
      borderRadius: borderRadius.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      fontSize: typography.fontSize.base,
      color: themedColors.text.primary,
      width: 80,
      textAlign: 'center',
    },
    emptyBox: {
      backgroundColor: themedColors.background.card,
      borderRadius: borderRadius.md,
      padding: spacing.xl,
      alignItems: 'center',
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: themedColors.border.main,
    },
    emptyText: {
      fontSize: typography.fontSize.sm,
      color: themedColors.text.secondary,
      textAlign: 'center',
    },
    loadingBox: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    // Tenant card
    card: {
      backgroundColor: themedColors.background.card,
      borderRadius: borderRadius.lg,
      padding: spacing.base,
      marginBottom: spacing.md,
      borderWidth: 1,
      borderColor: themedColors.border.light,
      ...shadows.sm,
    },
    cardUnit: {
      fontSize: typography.fontSize.base,
      fontWeight: typography.fontWeight.semibold as any,
      color: themedColors.primary[500],
    },
    cardTenant: {
      fontSize: typography.fontSize.base,
      fontWeight: typography.fontWeight.semibold as any,
      color: themedColors.text.primary,
      marginTop: 2,
    },
    cardPhone: {
      fontSize: typography.fontSize.sm,
      color: themedColors.text.tertiary,
      marginTop: 2,
    },
    statusBadge: {
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: borderRadius.sm,
    },
    badgePaid: { backgroundColor: themedColors.success + '20' },
    badgeOverpaid: { backgroundColor: themedColors.success + '30' },
    badgeUnpaid: { backgroundColor: themedColors.error + '20' },
    statusBadgeText: {
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.semibold as any,
      color: themedColors.text.primary,
    },
    cardAmounts: { marginTop: spacing.md, gap: spacing.xs },
    amountLabel: {
      fontSize: typography.fontSize.sm,
      color: themedColors.text.secondary,
    },
    amountValue: {
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.semibold as any,
      color: themedColors.text.primary,
    },
    totalRow: {
      borderTopWidth: 1,
      borderTopColor: themedColors.border.light,
      paddingTop: spacing.sm,
      marginTop: spacing.xs,
    },
    totalLabel: {
      fontSize: typography.fontSize.base,
      fontWeight: typography.fontWeight.semibold as any,
      color: themedColors.text.primary,
    },
    totalValue: {
      fontSize: typography.fontSize.base,
      fontWeight: typography.fontWeight.bold as any,
      color: themedColors.text.primary,
    },
    // Unpaid notice
    unpaidNotice: {
      marginTop: spacing.md,
      padding: spacing.sm,
      backgroundColor: themedColors.error + '10',
      borderRadius: borderRadius.sm,
      borderLeftWidth: 3,
      borderLeftColor: themedColors.error,
    },
    unpaidNoticeText: {
      fontSize: typography.fontSize.xs,
      color: themedColors.error,
      fontWeight: typography.fontWeight.medium as any,
    },
    // Footer
    cardFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: spacing.md,
    },
    monthTag: {
      fontSize: typography.fontSize.xs,
      color: themedColors.text.tertiary,
      backgroundColor: themedColors.background.secondary,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: borderRadius.sm,
      overflow: 'hidden',
    },
    printerBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: themedColors.primary[500],
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.md,
      gap: spacing.xs,
    },
    printerBtnDisabled: {
      backgroundColor: themedColors.background.secondary,
      borderWidth: 1,
      borderColor: themedColors.border.main,
    },
    printerBtnText: {
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.semibold as any,
      color: '#FFFFFF',
    },
    printerBtnTextDisabled: {
      color: themedColors.text.tertiary,
    },
    // Section divider
    sectionDivider: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: spacing.md,
      gap: spacing.sm,
    },
    sectionLine: {
      flex: 1,
      height: 1,
      backgroundColor: themedColors.border.light,
    },
    sectionLabel: {
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.semibold as any,
      color: themedColors.text.tertiary,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
  }), [themedColors]);

  // ── Render a single tenant card ────────────────────────────
  const renderCard = (p: PaymentRecord) => {
    const totalPaid = (p.bank_paid || 0) + (p.cash_paid || 0);
    const fullyPaid = p.paid || totalPaid >= p.total_amount;
    const overpaid = p.balance < 0;
    const canPrint = fullyPaid;

    const statusLabel = overpaid ? 'Overpaid' : fullyPaid ? 'Paid' : 'Unpaid';
    const badgeStyle = overpaid
      ? dynamicStyles.badgeOverpaid
      : fullyPaid
        ? dynamicStyles.badgePaid
        : dynamicStyles.badgeUnpaid;

    return (
      <View key={p.id} style={dynamicStyles.card}>
        {/* Header */}
        <View style={styles.cardHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={dynamicStyles.cardUnit}>Unit {p.houseNo}</Text>
            <Text style={dynamicStyles.cardTenant}>{p.name}</Text>
            <Text style={dynamicStyles.cardPhone}>
              {formatPhoneDisplay(p.tenantPhone)}
            </Text>
          </View>
          <View style={[dynamicStyles.statusBadge, badgeStyle]}>
            <Text style={dynamicStyles.statusBadgeText}>{statusLabel}</Text>
          </View>
        </View>

        {/* Amounts */}
        <View style={dynamicStyles.cardAmounts}>
          <View style={styles.amountRow}>
            <Text style={dynamicStyles.amountLabel}>Rent</Text>
            <Text style={dynamicStyles.amountValue}>{fmt(p.baseRent)}</Text>
          </View>
          <View style={styles.amountRow}>
            <Text style={dynamicStyles.amountLabel}>Garbage</Text>
            <Text style={dynamicStyles.amountValue}>{fmt(p.garbageFees)}</Text>
          </View>
          <View style={styles.amountRow}>
            <Text style={dynamicStyles.amountLabel}>Water ({p.previousWaterUnits} → {p.currentWaterUnits})</Text>
            <Text style={dynamicStyles.amountValue}>{fmt(p.waterBill)}</Text>
          </View>
          {(p.carryForward || 0) > 0 && (
            <View style={styles.amountRow}>
              <Text style={[dynamicStyles.amountLabel, { color: themedColors.success }]}>
                Carry Forward Credit
              </Text>
              <Text style={[dynamicStyles.amountValue, { color: themedColors.success }]}>
                -{fmt(p.carryForward)}
              </Text>
            </View>
          )}
          <View style={[styles.amountRow, dynamicStyles.totalRow]}>
            <Text style={dynamicStyles.totalLabel}>Total Bill</Text>
            <Text style={dynamicStyles.totalValue}>{fmt(p.total_amount)}</Text>
          </View>
          {(p.bank_paid || 0) > 0 && (
            <View style={styles.amountRow}>
              <Text style={dynamicStyles.amountLabel}>Bank Paid</Text>
              <Text style={[dynamicStyles.amountValue, { color: themedColors.success }]}>
                {fmt(p.bank_paid)}
              </Text>
            </View>
          )}
          {(p.cash_paid || 0) > 0 && (
            <View style={styles.amountRow}>
              <Text style={dynamicStyles.amountLabel}>Cash Paid</Text>
              <Text style={[dynamicStyles.amountValue, { color: themedColors.success }]}>
                {fmt(p.cash_paid)}
              </Text>
            </View>
          )}
          <View style={styles.amountRow}>
            <Text style={dynamicStyles.amountLabel}>Balance</Text>
            <Text
              style={[
                dynamicStyles.amountValue,
                { color: p.balance <= 0 ? themedColors.success : themedColors.error },
              ]}
            >
              {p.balance < 0
                ? `Overpaid ${fmt(Math.abs(p.balance))} (carries forward)`
                : fmt(p.balance)}
            </Text>
          </View>
        </View>

        {/* Unpaid notice */}
        {!fullyPaid && (
          <View style={dynamicStyles.unpaidNotice}>
            <Text style={dynamicStyles.unpaidNoticeText}>
              ⚠ Rent not fully paid. Outstanding balance: {fmt(Math.max(0, p.balance))}
              {p.trans_id ? ` | Trans: ${p.trans_id}` : ''}
            </Text>
          </View>
        )}

        {/* Footer: month tag + print */}
        <View style={dynamicStyles.cardFooter}>
          <Text style={dynamicStyles.monthTag}>
            {monthLabel} {selectedYear}
          </Text>
          <TouchableOpacity
            style={[
              dynamicStyles.printerBtn,
              !canPrint && dynamicStyles.printerBtnDisabled,
            ]}
            disabled={!canPrint}
            onPress={() => openReceipt(p)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                dynamicStyles.printerBtnText,
                !canPrint && dynamicStyles.printerBtnTextDisabled,
              ]}
            >
              🖨️ {canPrint ? 'Print Receipt' : 'Awaiting Payment'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // Split into paid and unpaid sections
  const { paidList, unpaidList } = useMemo(() => {
    const paid: PaymentRecord[] = [];
    const unpaid: PaymentRecord[] = [];
    sortedAndFiltered.forEach(p => {
      const totalPaid = (p.bank_paid || 0) + (p.cash_paid || 0);
      const fullyPaid = p.paid || totalPaid >= p.total_amount;
      if (fullyPaid) paid.push(p);
      else unpaid.push(p);
    });
    return { paidList: paid, unpaidList: unpaid };
  }, [sortedAndFiltered]);

  // ── Main render ────────────────────────────────────────────
  return (
    <SafeAreaView style={dynamicStyles.container} edges={['top']}>
      {/* Header */}
      <View style={dynamicStyles.header}>
        <TouchableOpacity
          style={dynamicStyles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Text style={dynamicStyles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={dynamicStyles.headerTitle} numberOfLines={1}>
          {plotName || 'Receipts'}
        </Text>
      </View>

      {loading ? (
        <View style={dynamicStyles.loadingBox}>
          <ActivityIndicator size="large" color={themedColors.primary[500]} />
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Search bar */}
          <TextInput
            style={dynamicStyles.searchInput}
            placeholder="Search tenant, house no, trans ID..."
            placeholderTextColor={themedColors.text.placeholder}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />

          {/* Month/Year selector */}
          {renderMonthYearSelector()}

          {sortedAndFiltered.length === 0 ? (
            <View style={dynamicStyles.emptyBox}>
              <Text style={dynamicStyles.emptyText}>
                No payment records for {monthLabel} {selectedYear}.
              </Text>
            </View>
          ) : (
            <>
              {/* Paid section */}
              {paidList.length > 0 && (
                <>
                  <View style={dynamicStyles.sectionDivider}>
                    <View style={dynamicStyles.sectionLine} />
                    <Text style={dynamicStyles.sectionLabel}>
                      Completed ({paidList.length})
                    </Text>
                    <View style={dynamicStyles.sectionLine} />
                  </View>
                  {paidList.map(renderCard)}
                </>
              )}

              {/* Unpaid section */}
              {unpaidList.length > 0 && (
                <>
                  <View style={dynamicStyles.sectionDivider}>
                    <View style={dynamicStyles.sectionLine} />
                    <Text style={dynamicStyles.sectionLabel}>
                      Pending ({unpaidList.length})
                    </Text>
                    <View style={dynamicStyles.sectionLine} />
                  </View>
                  {unpaidList.map(renderCard)}
                </>
              )}
            </>
          )}

          <View style={{ height: spacing['3xl'] }} />
        </ScrollView>
      )}

      {/* Receipt printer modal */}
      <ReceiptPrinter
        visible={receiptVisible}
        payment={receiptPayment}
        onClose={() => setReceiptVisible(false)}
      />
    </SafeAreaView>
  );
}

// ─── Static styles ─────────────────────────────────────────
const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.base,
  },
  monthYearSection: {
    marginBottom: spacing.lg,
  },
  yearRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
