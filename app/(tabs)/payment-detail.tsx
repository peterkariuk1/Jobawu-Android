/**
 * Payment Detail Page
 * Two tabs: Rent (view payments, add cash, edit water) and Invoice (create bills)
 * Real-time listener on transactions to auto-reconcile bank payments.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Linking,
    Modal,
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
    autoCreateBillFromTransaction,
    createBill,
    getAllPlots,
    getCarryForward,
    getPaymentsForPlotMonth,
    HouseUnit,
    listenToTransactions,
    PaymentRecord,
    PlotRecord,
    reconcileTransactionToBill,
    TransactionRecord,
    updateHouseWaterUnits,
    updatePaymentRecord,
} from '../../services/firestore-service';

// ─── Constants ───────────────────────────────────────────────
const WATER_RATE = 22; // KES per unit

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

type TabKey = 'rent' | 'invoice';

export default function PaymentDetail() {
  const themedColors = useThemedColors();
  const router = useRouter();
  const { plotId, plotName } = useLocalSearchParams<{ plotId: string; plotName: string }>();

  // ── State ──────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabKey>('rent');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());

  const [plot, setPlot] = useState<PlotRecord | null>(null);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);

  // Water-unit inputs keyed by houseNo (Invoice tab)
  const [waterInputs, setWaterInputs] = useState<Record<string, string>>({});

  // Edit modal state (Rent tab — card tap)
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editPayment, setEditPayment] = useState<PaymentRecord | null>(null);
  const [editCashAmount, setEditCashAmount] = useState('');
  const [editWaterUnits, setEditWaterUnits] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Receipt printer state
  const [receiptVisible, setReceiptVisible] = useState(false);
  const [receiptPayment, setReceiptPayment] = useState<PaymentRecord | null>(null);

  // Ref for cleanup
  const unsubRef = useRef<(() => void) | null>(null);

  // ── Data loading ───────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!plotId) return;
    setLoading(true);
    try {
      const [allPlots, monthPayments] = await Promise.all([
        getAllPlots(),
        getPaymentsForPlotMonth(plotId, selectedMonth, selectedYear),
      ]);
      const foundPlot = allPlots.find(p => p.id === plotId) ?? null;
      setPlot(foundPlot);
      setPayments(monthPayments);
      setWaterInputs({});
    } catch (error) {
      console.error('[PaymentDetail] loadData error:', error);
      Alert.alert('Error', 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [plotId, selectedMonth, selectedYear]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Real-time transaction listener ─────────────────────────
  useEffect(() => {
    if (!plotId) return;

    // Collect phone numbers of tenants in this plot for matching
    const tenantPhones = new Set<string>();
    if (plot) {
      plot.houses.forEach(h => {
        if (h.tenantPhone) tenantPhones.add(h.tenantPhone);
      });
    }

    const unsub = listenToTransactions(async (transactions: TransactionRecord[]) => {
      if (tenantPhones.size === 0) return;

      let didReconcile = false;

      for (const txn of transactions) {
        if (!txn.senderPhone || !tenantPhones.has(txn.senderPhone)) continue;

        // Try reconciling against existing bill
        const matchedId = await reconcileTransactionToBill(txn, selectedMonth, selectedYear);
        if (matchedId) {
          didReconcile = true;
          continue;
        }

        // No bill exists — auto-create one
        const autoId = await autoCreateBillFromTransaction(txn, selectedMonth, selectedYear);
        if (autoId) didReconcile = true;
      }

      if (didReconcile) {
        // Refresh local data to reflect reconciled payments
        await loadData();
      }
    });

    unsubRef.current = unsub;
    return () => { unsub(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plotId, plot, selectedMonth, selectedYear]);

  // ── Derived data ───────────────────────────────────────────
  const occupiedUnits: (HouseUnit & { _index: number })[] = useMemo(() => {
    if (!plot) return [];
    return plot.houses
      .map((h, i) => ({ ...h, _index: i }))
      .filter(h => h.tenant);
  }, [plot]);

  const billedHouseNos = useMemo(
    () => new Set(payments.map(p => p.houseNo)),
    [payments]
  );

  const invoiceableUnits = useMemo(
    () => occupiedUnits.filter(u => !billedHouseNos.has(u.houseNo)),
    [occupiedUnits, billedHouseNos]
  );

  const dashboardTotals = useMemo(() => {
    const totalRent = payments.reduce((s, p) => s + (p.baseRent || 0), 0);
    const totalGarbage = payments.reduce((s, p) => s + (p.garbageFees || 0), 0);
    const totalWater = payments.reduce((s, p) => s + (p.waterBill || 0), 0);
    return { totalRent, totalGarbage, totalWater };
  }, [payments]);

  // ── Helpers ────────────────────────────────────────────────
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

  const getWaterInput = (houseNo: string) => waterInputs[houseNo] ?? '';

  const calcWaterBill = (prev: number, curr: number) => {
    const diff = curr - prev;
    return diff > 0 ? diff * WATER_RATE : 0;
  };

  const buildMessage = (
    name: string,
    houseNo: string,
    baseRent: number,
    garbageFees: number,
    waterBill: number,
    prevUnits: number,
    currUnits: number,
    total: number,
    carryFwd: number,
  ) => {
    let msg =
      `Hello ${name} of house number ${houseNo}, your ${monthLabel} ${selectedYear} total bill is as follows:\n\n` +
      `Base rent: ${fmt(baseRent)}\n` +
      `Garbage collection service: ${fmt(garbageFees)}\n` +
      `Water bill: ${fmt(waterBill)} (usage: ${prevUnits} to ${currUnits} UNITS)\n`;
    if (carryFwd > 0) {
      msg += `Credit from previous month: -${fmt(carryFwd)}\n`;
    }
    msg += `\nTotal outstanding bill: ${fmt(total)}\n\nThank you for your business.`;
    return msg;
  };

  const buildReminderMessage = (p: PaymentRecord) => {
    const bal = Math.max(0, p.balance);
    return buildMessage(
      p.name, p.houseNo, p.baseRent, p.garbageFees,
      p.waterBill, p.previousWaterUnits, p.currentWaterUnits,
      bal, p.carryForward
    );
  };

  const openSms = (phone: string, message: string) => {
    const url = `sms:+${phone}?body=${encodeURIComponent(message)}`;
    Linking.openURL(url).catch(() => Alert.alert('Error', 'Could not open SMS app'));
  };

  const openWhatsApp = (phone: string, message: string) => {
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    Linking.openURL(url).catch(() => Alert.alert('Error', 'Could not open WhatsApp'));
  };

  // ── Save a bill (Invoice) ─────────────────────────────────
  const handleSaveBill = async (unit: HouseUnit & { _index: number }) => {
    const currStr = waterInputs[unit.houseNo];
    const currUnits = parseInt(currStr) || 0;

    if (currUnits < unit.previousWaterUnits) {
      Alert.alert(
        'Validation Error',
        `Current water units (${currUnits}) must be ≥ previous (${unit.previousWaterUnits})`
      );
      return;
    }

    setSaving(unit.houseNo);
    try {
      const waterBill = calcWaterBill(unit.previousWaterUnits, currUnits);
      const carryFwd = await getCarryForward(plotId!, unit.houseNo, selectedMonth, selectedYear);
      const grossTotal = unit.baseRent + unit.garbageFees + waterBill;
      const totalAmount = Math.max(0, grossTotal - carryFwd);

      const billData: Omit<PaymentRecord, 'id'> = {
        plotId: plotId!,
        plotName: plotName || plot?.plotName || '',
        houseNo: unit.houseNo,
        name: unit.tenantName || '',
        tenantPhone: unit.tenantPhone || '',
        month: selectedMonth,
        year: selectedYear,
        baseRent: unit.baseRent,
        garbageFees: unit.garbageFees,
        previousWaterUnits: unit.previousWaterUnits,
        currentWaterUnits: currUnits,
        waterBill,
        total_amount: totalAmount,
        paid: false,
        bank_paid: 0,
        cash_paid: 0,
        balance: totalAmount,
        carryForward: carryFwd,
        month_paid: '',
        trans_id: '',
        time: null,
      };

      const result = await createBill(billData);
      if (!result.success) {
        Alert.alert('Error', result.error || 'Failed to create bill');
        return;
      }

      await updateHouseWaterUnits(plotId!, unit.houseNo, currUnits);
      Alert.alert('Success', `Bill created for ${unit.tenantName} – ${fmt(totalAmount)}`);
      await loadData();
    } catch (error) {
      console.error('[PaymentDetail] handleSaveBill error:', error);
      Alert.alert('Error', 'Something went wrong creating the bill');
    } finally {
      setSaving(null);
    }
  };

  // ── Edit modal handlers (Rent tab) ─────────────────────────
  const openEditModal = (p: PaymentRecord) => {
    setEditPayment(p);
    setEditCashAmount('');
    setEditWaterUnits(p.currentWaterUnits?.toString() || '');
    setEditModalVisible(true);
  };

  const handleSaveEdit = async () => {
    if (!editPayment) return;
    setEditSaving(true);

    try {
      const cashToAdd = parseFloat(editCashAmount) || 0;
      const newWater = parseInt(editWaterUnits) || editPayment.currentWaterUnits;

      if (newWater < editPayment.previousWaterUnits) {
        Alert.alert('Error', `Water units must be ≥ ${editPayment.previousWaterUnits}`);
        setEditSaving(false);
        return;
      }

      // Recalculate water bill
      const newWaterBill = calcWaterBill(editPayment.previousWaterUnits, newWater);
      const grossTotal = editPayment.baseRent + editPayment.garbageFees + newWaterBill;
      const newTotalAmount = Math.max(0, grossTotal - (editPayment.carryForward || 0));

      const newCashPaid = (editPayment.cash_paid || 0) + cashToAdd;
      const totalPaid = (editPayment.bank_paid || 0) + newCashPaid;
      const newBalance = newTotalAmount - totalPaid;
      const isPaid = newBalance <= 0;

      await updatePaymentRecord(editPayment.id!, {
        currentWaterUnits: newWater,
        waterBill: newWaterBill,
        total_amount: newTotalAmount,
        cash_paid: newCashPaid,
        balance: newBalance,
        paid: isPaid,
        month_paid: isPaid ? `${monthLabel} ${selectedYear}` : editPayment.month_paid,
      });

      // Update water readings on the plot doc
      if (newWater !== editPayment.currentWaterUnits) {
        await updateHouseWaterUnits(plotId!, editPayment.houseNo, newWater);
      }

      setEditModalVisible(false);
      await loadData();
    } catch (error) {
      console.error('[PaymentDetail] handleSaveEdit error:', error);
      Alert.alert('Error', 'Failed to save changes');
    } finally {
      setEditSaving(false);
    }
  };

  // ── Month / Year selector (shared) ────────────────────────
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

  // ── Render: RENT tab ───────────────────────────────────────
  const renderRentTab = () => (
    <ScrollView
      style={styles.tabContent}
      contentContainerStyle={styles.tabContentInner}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* Mini Dashboard */}
      <View style={styles.dashboardRow}>
        <View style={dynamicStyles.dashCard}>
          <Text style={dynamicStyles.dashLabel}>Total Rent</Text>
          <Text style={dynamicStyles.dashValue}>{fmt(dashboardTotals.totalRent)}</Text>
        </View>
        <View style={dynamicStyles.dashCard}>
          <Text style={dynamicStyles.dashLabel}>Total Garbage</Text>
          <Text style={dynamicStyles.dashValue}>{fmt(dashboardTotals.totalGarbage)}</Text>
        </View>
        <View style={dynamicStyles.dashCard}>
          <Text style={dynamicStyles.dashLabel}>Total Water</Text>
          <Text style={dynamicStyles.dashValue}>{fmt(dashboardTotals.totalWater)}</Text>
        </View>
      </View>

      {renderMonthYearSelector()}

      {/* Payment cards */}
      {payments.length === 0 ? (
        <View style={dynamicStyles.emptyBox}>
          <Text style={dynamicStyles.emptyText}>
            No bills found for {monthLabel} {selectedYear}.
          </Text>
        </View>
      ) : (
        payments.map(p => {
          const totalPaid = (p.bank_paid || 0) + (p.cash_paid || 0);
          const fullyPaid = p.paid || totalPaid >= p.total_amount;
          return (
            <TouchableOpacity
              key={p.id}
              style={dynamicStyles.paymentCard}
              onPress={() => openEditModal(p)}
              activeOpacity={0.7}
            >
              {/* Header */}
              <View style={styles.cardHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={dynamicStyles.cardUnit}>Unit {p.houseNo}</Text>
                  <Text style={dynamicStyles.cardTenant}>{p.name}</Text>
                  <Text style={dynamicStyles.cardPhone}>
                    {formatPhoneDisplay(p.tenantPhone)}
                  </Text>
                </View>
                <View
                  style={[
                    dynamicStyles.statusBadge,
                    fullyPaid ? dynamicStyles.badgePaid : dynamicStyles.badgeUnpaid,
                  ]}
                >
                  <Text style={dynamicStyles.statusBadgeText}>
                    {fullyPaid ? 'Paid' : 'Unpaid'}
                  </Text>
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
                  <Text style={dynamicStyles.amountLabel}>Water</Text>
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

              {/* Footer: month tag, messaging, printer */}
              <View style={styles.cardFooterRow}>
                <Text style={dynamicStyles.monthTag}>
                  {monthLabel} {selectedYear}
                </Text>
                <View style={styles.msgIcons}>
                  {/* SMS */}
                  <TouchableOpacity
                    style={dynamicStyles.msgBtnSmall}
                    onPress={(e) => {
                      e.stopPropagation?.();
                      if (!p.tenantPhone) return Alert.alert('Error', 'No phone number');
                      if (fullyPaid) {
                        Alert.alert(
                          'Tenant Already Paid',
                          'This tenant has already paid in full. Do you still want to send a reminder?',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Send Anyway', onPress: () => openSms(p.tenantPhone!, buildReminderMessage(p)) },
                          ]
                        );
                      } else {
                        openSms(p.tenantPhone, buildReminderMessage(p));
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={dynamicStyles.msgBtnSmallText}>💬</Text>
                  </TouchableOpacity>
                  {/* WhatsApp */}
                  <TouchableOpacity
                    style={dynamicStyles.msgBtnSmall}
                    onPress={(e) => {
                      e.stopPropagation?.();
                      if (!p.tenantPhone) return Alert.alert('Error', 'No phone number');
                      if (fullyPaid) {
                        Alert.alert(
                          'Tenant Already Paid',
                          'This tenant has already paid in full. Do you still want to send a reminder?',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Send Anyway', onPress: () => openWhatsApp(p.tenantPhone!, buildReminderMessage(p)) },
                          ]
                        );
                      } else {
                        openWhatsApp(p.tenantPhone, buildReminderMessage(p));
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={dynamicStyles.msgBtnSmallText}>📱</Text>
                  </TouchableOpacity>
                  {/* Printer */}
                  <TouchableOpacity
                    style={[
                      dynamicStyles.printerBtn,
                      !fullyPaid && dynamicStyles.printerBtnDisabled,
                    ]}
                    disabled={!fullyPaid}
                    onPress={(e) => {
                      e.stopPropagation?.();
                      setReceiptPayment(p);
                      setReceiptVisible(true);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        dynamicStyles.printerIcon,
                        !fullyPaid && dynamicStyles.printerIconDisabled,
                      ]}
                    >
                      🖨️
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={dynamicStyles.tapHint}>Tap to edit / add cash →</Text>
            </TouchableOpacity>
          );
        })
      )}

      <View style={{ height: spacing['3xl'] }} />
    </ScrollView>
  );

  // ── Render: INVOICE tab ────────────────────────────────────
  const renderInvoiceTab = () => (
    <ScrollView
      style={styles.tabContent}
      contentContainerStyle={styles.tabContentInner}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {renderMonthYearSelector()}

      {invoiceableUnits.length === 0 ? (
        <View style={dynamicStyles.emptyBox}>
          <Text style={dynamicStyles.emptyText}>
            {occupiedUnits.length === 0
              ? 'No tenants assigned to this plot yet.'
              : `All tenants have been billed for ${monthLabel} ${selectedYear}.`}
          </Text>
        </View>
      ) : (
        invoiceableUnits.map(unit => {
          const currStr = getWaterInput(unit.houseNo);
          const currUnits = parseInt(currStr) || 0;
          const validWater = currStr.length === 0 || currUnits >= unit.previousWaterUnits;
          const waterBill = validWater && currStr.length > 0
            ? calcWaterBill(unit.previousWaterUnits, currUnits)
            : 0;
          const grossTotal = unit.baseRent + unit.garbageFees + waterBill;
          const isSaving = saving === unit.houseNo;

          return (
            <View key={unit.houseNo} style={dynamicStyles.invoiceCard}>
              <View style={styles.cardHeaderRow}>
                <View>
                  <Text style={dynamicStyles.cardUnit}>Unit {unit.houseNo}</Text>
                  <Text style={dynamicStyles.cardTenant}>{unit.tenantName}</Text>
                  <Text style={dynamicStyles.cardPhone}>
                    {formatPhoneDisplay(unit.tenantPhone)}
                  </Text>
                </View>
              </View>

              <View style={dynamicStyles.cardAmounts}>
                <View style={styles.amountRow}>
                  <Text style={dynamicStyles.amountLabel}>Base Rent</Text>
                  <Text style={dynamicStyles.amountValue}>{fmt(unit.baseRent)}</Text>
                </View>
                <View style={styles.amountRow}>
                  <Text style={dynamicStyles.amountLabel}>Garbage Fees</Text>
                  <Text style={dynamicStyles.amountValue}>{fmt(unit.garbageFees)}</Text>
                </View>
                <View style={styles.amountRow}>
                  <Text style={dynamicStyles.amountLabel}>Prev. Water Units</Text>
                  <Text style={dynamicStyles.amountValue}>{unit.previousWaterUnits}</Text>
                </View>

                <View style={styles.waterInputRow}>
                  <Text style={dynamicStyles.amountLabel}>Current Water Units</Text>
                  <TextInput
                    style={dynamicStyles.waterInput}
                    value={currStr}
                    onChangeText={v =>
                      setWaterInputs(prev => ({ ...prev, [unit.houseNo]: v }))
                    }
                    placeholder={`≥ ${unit.previousWaterUnits}`}
                    placeholderTextColor={themedColors.text.placeholder}
                    keyboardType="numeric"
                  />
                </View>

                {currStr.length > 0 && !validWater && (
                  <Text style={dynamicStyles.validationError}>
                    Must be ≥ {unit.previousWaterUnits}
                  </Text>
                )}

                {validWater && currStr.length > 0 && (
                  <View style={styles.amountRow}>
                    <Text style={dynamicStyles.amountLabel}>
                      Water Bill ({currUnits - unit.previousWaterUnits} × {WATER_RATE})
                    </Text>
                    <Text style={dynamicStyles.amountValue}>{fmt(waterBill)}</Text>
                  </View>
                )}

                <View style={[styles.amountRow, dynamicStyles.totalRow]}>
                  <Text style={dynamicStyles.totalLabel}>Total Bill</Text>
                  <Text style={dynamicStyles.totalValue}>{fmt(grossTotal)}</Text>
                </View>
              </View>

              <View style={styles.invoiceActions}>
                <TouchableOpacity
                  style={[
                    dynamicStyles.saveBtn,
                    (isSaving || !validWater || currStr.length === 0) && dynamicStyles.saveBtnDisabled,
                  ]}
                  onPress={() => handleSaveBill(unit)}
                  disabled={isSaving || !validWater || currStr.length === 0}
                  activeOpacity={0.8}
                >
                  {isSaving ? (
                    <ActivityIndicator color="#FFF" size="small" />
                  ) : (
                    <Text style={dynamicStyles.saveBtnText}>Save Bill</Text>
                  )}
                </TouchableOpacity>

                <View style={styles.msgIcons}>
                  <TouchableOpacity
                    style={dynamicStyles.msgBtn}
                    onPress={() => {
                      if (!unit.tenantPhone) {
                        Alert.alert('Error', 'No phone number for this tenant');
                        return;
                      }
                      const msg = buildMessage(
                        unit.tenantName || '', unit.houseNo,
                        unit.baseRent, unit.garbageFees,
                        waterBill, unit.previousWaterUnits, currUnits,
                        grossTotal, 0
                      );
                      openSms(unit.tenantPhone, msg);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={dynamicStyles.msgBtnText}>💬 SMS</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={dynamicStyles.msgBtn}
                    onPress={() => {
                      if (!unit.tenantPhone) {
                        Alert.alert('Error', 'No phone number for this tenant');
                        return;
                      }
                      const msg = buildMessage(
                        unit.tenantName || '', unit.houseNo,
                        unit.baseRent, unit.garbageFees,
                        waterBill, unit.previousWaterUnits, currUnits,
                        grossTotal, 0
                      );
                      openWhatsApp(unit.tenantPhone, msg);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={dynamicStyles.msgBtnText}>📱 WhatsApp</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          );
        })
      )}

      <View style={{ height: spacing['3xl'] }} />
    </ScrollView>
  );

  // ── Edit payment modal (Rent tab) ──────────────────────────
  const renderEditModal = () => {
    if (!editPayment) return null;

    const newWater = parseInt(editWaterUnits) || editPayment.currentWaterUnits;
    const validWater = newWater >= editPayment.previousWaterUnits;
    const newWaterBill = validWater ? calcWaterBill(editPayment.previousWaterUnits, newWater) : editPayment.waterBill;
    const newGross = editPayment.baseRent + editPayment.garbageFees + newWaterBill;
    const newTotal = Math.max(0, newGross - (editPayment.carryForward || 0));
    const addCash = parseFloat(editCashAmount) || 0;
    const newCashPaid = (editPayment.cash_paid || 0) + addCash;
    const totalPaid = (editPayment.bank_paid || 0) + newCashPaid;
    const previewBalance = newTotal - totalPaid;

    return (
      <Modal
        visible={editModalVisible}
        animationType="slide"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <SafeAreaView style={dynamicStyles.modalContainer}>
          <View style={dynamicStyles.modalHeader}>
            <Text style={dynamicStyles.modalTitle}>
              Edit Payment — Unit {editPayment.houseNo}
            </Text>
            <TouchableOpacity onPress={() => setEditModalVisible(false)}>
              <Text style={dynamicStyles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={dynamicStyles.modalBody} keyboardShouldPersistTaps="handled">
            <Text style={dynamicStyles.modalSubtitle}>{editPayment.name}</Text>

            {/* Non-editable summary */}
            <View style={dynamicStyles.modalSection}>
              <View style={styles.amountRow}>
                <Text style={dynamicStyles.amountLabel}>Base Rent</Text>
                <Text style={dynamicStyles.amountValue}>{fmt(editPayment.baseRent)}</Text>
              </View>
              <View style={styles.amountRow}>
                <Text style={dynamicStyles.amountLabel}>Garbage Fees</Text>
                <Text style={dynamicStyles.amountValue}>{fmt(editPayment.garbageFees)}</Text>
              </View>
              {(editPayment.carryForward || 0) > 0 && (
                <View style={styles.amountRow}>
                  <Text style={[dynamicStyles.amountLabel, { color: themedColors.success }]}>
                    Carry Forward Credit
                  </Text>
                  <Text style={[dynamicStyles.amountValue, { color: themedColors.success }]}>
                    -{fmt(editPayment.carryForward)}
                  </Text>
                </View>
              )}
            </View>

            {/* Editable: Water Units */}
            <View style={dynamicStyles.modalSection}>
              <Text style={dynamicStyles.modalFieldLabel}>
                Current Water Units (prev: {editPayment.previousWaterUnits})
              </Text>
              <TextInput
                style={dynamicStyles.modalInput}
                value={editWaterUnits}
                onChangeText={setEditWaterUnits}
                placeholder={`≥ ${editPayment.previousWaterUnits}`}
                placeholderTextColor={themedColors.text.placeholder}
                keyboardType="numeric"
              />
              {!validWater && (
                <Text style={dynamicStyles.validationError}>
                  Must be ≥ {editPayment.previousWaterUnits}
                </Text>
              )}
              <View style={[styles.amountRow, { marginTop: spacing.xs }]}>
                <Text style={dynamicStyles.amountLabel}>Water Bill</Text>
                <Text style={dynamicStyles.amountValue}>{fmt(newWaterBill)}</Text>
              </View>
            </View>

            {/* Editable: Cash amount */}
            <View style={dynamicStyles.modalSection}>
              <Text style={dynamicStyles.modalFieldLabel}>Add Cash Payment (KES)</Text>
              <TextInput
                style={dynamicStyles.modalInput}
                value={editCashAmount}
                onChangeText={setEditCashAmount}
                placeholder="0"
                placeholderTextColor={themedColors.text.placeholder}
                keyboardType="numeric"
              />
              {(editPayment.bank_paid || 0) > 0 && (
                <Text style={dynamicStyles.modalHint}>
                  Bank paid (auto): {fmt(editPayment.bank_paid)}
                </Text>
              )}
              {(editPayment.cash_paid || 0) > 0 && (
                <Text style={dynamicStyles.modalHint}>
                  Previously added cash: {fmt(editPayment.cash_paid)}
                </Text>
              )}
            </View>

            {/* Preview */}
            <View style={[dynamicStyles.modalSection, dynamicStyles.previewBox]}>
              <View style={styles.amountRow}>
                <Text style={dynamicStyles.totalLabel}>New Total Bill</Text>
                <Text style={dynamicStyles.totalValue}>{fmt(newTotal)}</Text>
              </View>
              <View style={styles.amountRow}>
                <Text style={dynamicStyles.amountLabel}>Total Paid</Text>
                <Text style={[dynamicStyles.amountValue, { color: themedColors.success }]}>
                  {fmt(totalPaid)}
                </Text>
              </View>
              <View style={styles.amountRow}>
                <Text style={dynamicStyles.amountLabel}>Balance</Text>
                <Text
                  style={[
                    dynamicStyles.totalValue,
                    { color: previewBalance <= 0 ? themedColors.success : themedColors.error },
                  ]}
                >
                  {previewBalance < 0
                    ? `Overpaid ${fmt(Math.abs(previewBalance))} (carries forward)`
                    : fmt(previewBalance)}
                </Text>
              </View>
            </View>
          </ScrollView>

          {/* Modal actions */}
          <View style={dynamicStyles.modalActions}>
            <TouchableOpacity
              style={dynamicStyles.cancelBtn}
              onPress={() => setEditModalVisible(false)}
              disabled={editSaving}
            >
              <Text style={dynamicStyles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[dynamicStyles.saveBtn, editSaving && dynamicStyles.saveBtnDisabled]}
              onPress={handleSaveEdit}
              disabled={editSaving || !validWater}
              activeOpacity={0.8}
            >
              {editSaving ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <Text style={dynamicStyles.saveBtnText}>Save Changes</Text>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    );
  };

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
    tabBar: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: themedColors.border.main,
      backgroundColor: themedColors.background.primary,
    },
    tab: {
      flex: 1,
      paddingVertical: spacing.md,
      alignItems: 'center',
      borderBottomWidth: 2,
      borderBottomColor: 'transparent',
    },
    tabActive: { borderBottomColor: themedColors.primary[500] },
    tabText: {
      fontSize: typography.fontSize.base,
      fontWeight: typography.fontWeight.medium as any,
      color: themedColors.text.tertiary,
    },
    tabTextActive: {
      color: themedColors.primary[500],
      fontWeight: typography.fontWeight.semibold as any,
    },
    dashCard: {
      flex: 1,
      backgroundColor: themedColors.background.card,
      borderRadius: borderRadius.md,
      padding: spacing.sm,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: themedColors.border.light,
    },
    dashLabel: {
      fontSize: typography.fontSize.xs,
      color: themedColors.text.tertiary,
      marginBottom: spacing.xs,
      textAlign: 'center',
    },
    dashValue: {
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.bold as any,
      color: themedColors.text.primary,
      textAlign: 'center',
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
    paymentCard: {
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
    monthTag: {
      fontSize: typography.fontSize.xs,
      color: themedColors.text.tertiary,
      backgroundColor: themedColors.background.secondary,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: borderRadius.sm,
      overflow: 'hidden',
    },
    tapHint: {
      fontSize: typography.fontSize.xs,
      color: themedColors.text.placeholder,
      textAlign: 'right',
      marginTop: spacing.sm,
    },
    msgBtnSmall: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: themedColors.primary[50],
      justifyContent: 'center',
      alignItems: 'center',
    },
    msgBtnSmallText: { fontSize: 16 },
    printerBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: themedColors.primary[50],
      justifyContent: 'center',
      alignItems: 'center',
    },
    printerBtnDisabled: { opacity: 0.35 },
    printerIcon: { fontSize: 16 },
    printerIconDisabled: { opacity: 0.5 },
    invoiceCard: {
      backgroundColor: themedColors.background.card,
      borderRadius: borderRadius.lg,
      padding: spacing.base,
      marginBottom: spacing.md,
      borderWidth: 1,
      borderColor: themedColors.border.light,
      ...shadows.sm,
    },
    waterInput: {
      backgroundColor: themedColors.background.primary,
      borderWidth: 1,
      borderColor: themedColors.border.main,
      borderRadius: borderRadius.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      fontSize: typography.fontSize.sm,
      color: themedColors.text.primary,
      width: 100,
      textAlign: 'center',
    },
    validationError: {
      fontSize: typography.fontSize.xs,
      color: themedColors.error,
      marginTop: 2,
    },
    saveBtn: {
      flex: 1,
      backgroundColor: themedColors.primary[500],
      borderRadius: borderRadius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 44,
    },
    saveBtnDisabled: { opacity: 0.5 },
    saveBtnText: {
      fontSize: typography.fontSize.base,
      fontWeight: typography.fontWeight.semibold as any,
      color: '#FFFFFF',
    },
    msgBtn: {
      backgroundColor: themedColors.primary[50],
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.md,
    },
    msgBtnText: {
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.medium as any,
      color: themedColors.primary[600],
    },
    loadingBox: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    // Modal styles
    modalContainer: {
      flex: 1,
      backgroundColor: themedColors.background.primary,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: spacing.base,
      borderBottomWidth: 1,
      borderBottomColor: themedColors.border.main,
    },
    modalTitle: {
      fontSize: typography.fontSize.lg,
      fontWeight: typography.fontWeight.bold as any,
      color: themedColors.text.primary,
      flex: 1,
    },
    modalClose: {
      fontSize: typography.fontSize.xl,
      color: themedColors.text.secondary,
      paddingLeft: spacing.md,
    },
    modalBody: { padding: spacing.base },
    modalSubtitle: {
      fontSize: typography.fontSize.base,
      color: themedColors.text.secondary,
      marginBottom: spacing.md,
    },
    modalSection: {
      marginBottom: spacing.lg,
      gap: spacing.xs,
    },
    modalFieldLabel: {
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.medium as any,
      color: themedColors.text.secondary,
      marginBottom: spacing.xs,
    },
    modalInput: {
      backgroundColor: themedColors.background.card,
      borderWidth: 1,
      borderColor: themedColors.border.main,
      borderRadius: borderRadius.sm,
      padding: spacing.md,
      fontSize: typography.fontSize.base,
      color: themedColors.text.primary,
    },
    modalHint: {
      fontSize: typography.fontSize.xs,
      color: themedColors.text.tertiary,
      marginTop: spacing.xs,
    },
    previewBox: {
      backgroundColor: themedColors.background.secondary,
      borderRadius: borderRadius.md,
      padding: spacing.base,
    },
    modalActions: {
      flexDirection: 'row',
      gap: spacing.md,
      padding: spacing.base,
      borderTopWidth: 1,
      borderTopColor: themedColors.border.main,
    },
    cancelBtn: {
      flex: 1,
      backgroundColor: themedColors.background.secondary,
      padding: spacing.md,
      borderRadius: borderRadius.sm,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: themedColors.border.main,
    },
    cancelBtnText: {
      color: themedColors.text.primary,
      fontSize: typography.fontSize.base,
      fontWeight: typography.fontWeight.semibold as any,
    },
  }), [themedColors]);

  // ── Main render ────────────────────────────────────────────
  return (
    <SafeAreaView style={dynamicStyles.container} edges={['top']}>
      <View style={dynamicStyles.header}>
        <TouchableOpacity
          style={dynamicStyles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Text style={dynamicStyles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={dynamicStyles.headerTitle} numberOfLines={1}>
          {plotName || 'Payment Details'}
        </Text>
      </View>

      <View style={dynamicStyles.tabBar}>
        {(['rent', 'invoice'] as TabKey[]).map(tab => {
          const active = activeTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              style={[dynamicStyles.tab, active && dynamicStyles.tabActive]}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.7}
            >
              <Text
                style={[dynamicStyles.tabText, active && dynamicStyles.tabTextActive]}
              >
                {tab === 'rent' ? 'Rent' : 'Invoice'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <View style={dynamicStyles.loadingBox}>
          <ActivityIndicator size="large" color={themedColors.primary[500]} />
        </View>
      ) : activeTab === 'rent' ? (
        renderRentTab()
      ) : (
        renderInvoiceTab()
      )}

      {/* Edit payment modal */}
      {renderEditModal()}

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
  tabContent: {
    flex: 1,
  },
  tabContentInner: {
    padding: spacing.base,
  },
  dashboardRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
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
  waterInputRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: spacing.xs,
  },
  cardFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  invoiceActions: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  msgIcons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
