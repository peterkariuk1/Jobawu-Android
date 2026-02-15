/**
 * Reusable Receipt Printer Component
 * Renders a styled receipt preview and prints via Android's native print dialog
 * (triggers the system print service so the user can pick their thermal receipt printer).
 *
 * The print layout targets 55 mm-wide thermal receipt paper.
 *
 * expo-print is loaded dynamically so the app never crashes at startup
 * even if the native module hasn't been linked yet.
 *
 * Usage:
 *   <ReceiptPrinter
 *     visible={showReceipt}
 *     payment={paymentRecord}
 *     onClose={() => setShowReceipt(false)}
 *   />
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    Modal,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { borderRadius, spacing, typography } from '../constants/design';
import { useThemedColors } from '../hooks/use-themed-colors';
import { PaymentRecord } from '../services/firestore-service';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const logoImage = require('../assets/images/jobawulogo.png');

interface ReceiptPrinterProps {
  visible: boolean;
  /** Single payment (individual receipt mode) */
  payment?: PaymentRecord | null;
  /** Array of payments (plot-level "Print All" mode) */
  payments?: PaymentRecord[];
  onClose: () => void;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// ── HTML receipt builder (55 mm thermal) ────────────────────
function buildReceiptHtml(payment: PaymentRecord, monthLabel: string, maskedPhone: string, timeStr: string): string {
  const fmt = (n: number) => `KES ${n.toLocaleString('en-KE', { minimumFractionDigits: 0 })}`;
  const balance = payment.balance ?? 0;
  const cashRow = (payment.cash_paid || 0) > 0
    ? `<tr><td>Cash Paid</td><td class="val green">${fmt(payment.cash_paid)}</td></tr>`
    : '';
  const balLabel = balance < 0 ? 'Carry Forward' : 'Balance';
  const balColor = balance <= 0 ? 'green' : 'red';
  const balValue = balance < 0 ? fmt(Math.abs(balance)) : fmt(balance);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  @page {
    size: 55mm auto;
    margin: 0;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 55mm;
    font-family: 'Courier New', Courier, monospace;
    font-size: 9pt;
    color: #000;
    padding: 2mm;
  }
  .center { text-align: center; }
  .bold   { font-weight: bold; }
  .green  { color: #16a34a; }
  .red    { color: #dc2626; }
  hr {
    border: none;
    border-top: 1px dashed #999;
    margin: 3mm 0;
  }
  h2 { font-size: 11pt; margin-bottom: 1mm; }
  .info { font-size: 8pt; margin: 0.5mm 0; }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 8.5pt;
  }
  td { padding: 0.5mm 0; }
  td.val { text-align: right; white-space: nowrap; }
  .total td { font-weight: bold; border-top: 1px solid #000; padding-top: 1mm; }
  .footer { font-size: 7pt; color: #555; margin-top: 2mm; }
  .thankyou { font-size: 12pt; font-weight: bold; letter-spacing: 2px; margin-top: 2mm; }
</style>
</head>
<body>
  <div class="center bold"><h2>JOBAWU</h2></div>

  <hr/>

  <div class="center">
    <div class="bold" style="font-size:10pt">${payment.name}</div>
    <div class="info">${maskedPhone}</div>
    <div class="info">House ${payment.houseNo}</div>
    <div class="info">Month: ${monthLabel}</div>
  </div>

  <hr/>

  <table>
    <tr><td>Base Rent</td><td class="val">${fmt(payment.baseRent)}</td></tr>
    <tr><td>Garbage Fee</td><td class="val">${fmt(payment.garbageFees)}</td></tr>
    <tr><td>Water (${payment.previousWaterUnits}→${payment.currentWaterUnits})</td><td class="val">${fmt(payment.waterBill)}</td></tr>
    <tr class="total"><td>Total Bill</td><td class="val">${fmt(payment.total_amount)}</td></tr>
  </table>

  <hr/>

  <table>
    <tr><td>Bank Paid</td><td class="val green">${fmt(payment.bank_paid)}</td></tr>
    ${cashRow}
    <tr class="total"><td>${balLabel}</td><td class="val ${balColor}">${balValue}</td></tr>
  </table>

  <hr/>

  ${payment.trans_id ? `<div class="center info" style="font-size:7pt;color:#333;margin-bottom:1mm">Trans ID: ${payment.trans_id}</div>` : ''}
  <div class="center footer">Served by Grace at ${timeStr}</div>
  <div class="center thankyou">THANK YOU</div>
</body>
</html>`;
}

// ── Helpers shared across single & multi mode ──────────────
const fmt = (n: number) =>
  `KES ${n.toLocaleString('en-KE', { minimumFractionDigits: 0 })}`;

const maskPhone = (phone?: string | null): string => {
  if (!phone) return '-';
  let display = phone;
  if (phone.startsWith('254') && phone.length >= 12) {
    display = '0' + phone.substring(3);
  }
  if (display.length >= 8) {
    const start = Math.floor((display.length - 5) / 2);
    return display.substring(0, start) + '*****' + display.substring(start + 5);
  }
  return display;
};

const getMonthLabel = (p: PaymentRecord) =>
  MONTH_NAMES[(p.month || 1) - 1] + ' ' + p.year;

const getTransactionTime = (p: PaymentRecord) => {
  if (p.time) {
    if (typeof p.time === 'string') return p.time;
    if (p.time?.toDate?.()) return p.time.toDate().toLocaleString('en-KE');
  }
  if (p.createdAt?.toDate?.()) return p.createdAt.toDate().toLocaleString('en-KE');
  return '-';
};

// ── Single receipt body (used in both single & multi mode) ──
function ReceiptBody({ payment: p, ds, isLast }: {
  payment: PaymentRecord;
  ds: any;
  isLast?: boolean;
}) {
  const bal = p.balance ?? 0;
  const time = getTransactionTime(p);
  const month = getMonthLabel(p);

  return (
    <>
    <View style={ds.receipt}>
      <View style={ds.logoContainer}>
        <Image source={logoImage} style={ds.logo} />
      </View>

      <Text style={ds.tenantName}>{p.name}</Text>
      <Text style={ds.tenantDetail}>{maskPhone(p.tenantPhone)}</Text>
      <Text style={ds.tenantDetail}>House {p.houseNo}</Text>
      <Text style={ds.tenantDetail}>Month Paid: {month}</Text>

      <View style={ds.hr} />

      <View style={ds.lineItem}>
        <Text style={ds.lineLabel}>Base Rent</Text>
        <Text style={ds.lineValue}>{fmt(p.baseRent)}</Text>
      </View>
      <View style={ds.lineItem}>
        <Text style={ds.lineLabel}>Garbage Collection Fee</Text>
        <Text style={ds.lineValue}>{fmt(p.garbageFees)}</Text>
      </View>
      <View style={ds.lineItem}>
        <Text style={ds.lineLabel}>
          Water ({p.previousWaterUnits} → {p.currentWaterUnits} units)
        </Text>
        <Text style={ds.lineValue}>{fmt(p.waterBill)}</Text>
      </View>
      <View style={ds.lineItem}>
        <Text style={[ds.lineLabel, { fontWeight: '700' as any }]}>Total Bill</Text>
        <Text style={[ds.lineValue, { fontWeight: '700' as any }]}>
          {fmt(p.total_amount)}
        </Text>
      </View>

      <View style={ds.hr} />

      <View style={ds.lineItem}>
        <Text style={ds.lineLabel}>Bank Paid</Text>
        <Text style={[ds.lineValue, { color: '#16a34a' }]}>
          {fmt(p.bank_paid)}
        </Text>
      </View>
      {(p.cash_paid || 0) > 0 && (
        <View style={ds.lineItem}>
          <Text style={ds.lineLabel}>Cash Paid</Text>
          <Text style={[ds.lineValue, { color: '#16a34a' }]}>
            {fmt(p.cash_paid)}
          </Text>
        </View>
      )}
      <View style={ds.lineItem}>
        <Text style={ds.lineLabel}>
          {bal < 0 ? 'Carry Forward' : 'Balance'}
        </Text>
        <Text
          style={[
            ds.lineValue,
            { color: bal <= 0 ? '#16a34a' : '#dc2626' },
          ]}
        >
          {bal < 0 ? fmt(Math.abs(bal)) : fmt(bal)}
        </Text>
      </View>

      <View style={ds.hr} />

      {p.trans_id ? (
        <Text style={[ds.footerText, { marginBottom: 4 }]}>
          Trans ID: {p.trans_id}
        </Text>
      ) : null}
      <View style={ds.footer}>
        <Text style={ds.footerText}>
          You were served by Grace at {time}
        </Text>
        <Text style={ds.thankYou}>THANK YOU</Text>
      </View>
    </View>
    {!isLast && <View style={ds.receiptSeparator} />}
    </>
  );
}

export function ReceiptPrinter({ visible, payment, payments, onClose }: ReceiptPrinterProps) {
  const themedColors = useThemedColors();
  const [printing, setPrinting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const receiptRef = useRef<View>(null);

  // Determine mode: multi-payment (plot) or single-payment
  const isMultiMode = !!(payments && payments.length > 0);
  const effectivePayment = payment ?? null;

  const monthLabel = effectivePayment
    ? getMonthLabel(effectivePayment)
    : isMultiMode
      ? getMonthLabel(payments![0])
      : '';

  const transactionTime = effectivePayment
    ? getTransactionTime(effectivePayment)
    : '-';

  const balance = effectivePayment?.balance ?? 0;

  // ── Print via native Android print dialog (as PNG image) ──
  const handlePrint = useCallback(async () => {
    if ((!effectivePayment && !isMultiMode) || !receiptRef.current) return;
    setPrinting(true);
    try {
      // Capture the receipt View as a PNG image (base64)
      const uri = await captureRef(receiptRef, {
        format: 'png',
        quality: 1,
        result: 'base64',
      });

      // Wrap the image in minimal HTML sized to 55 mm thermal paper
      const imgHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  @page { size: 55mm auto; margin: 0; }
  * { margin: 0; padding: 0; }
  body { width: 55mm; }
  img { width: 55mm; height: auto; display: block; }
</style>
</head>
<body>
  <img src="data:image/png;base64,${uri}" />
</body>
</html>`;

      // Dynamic import — avoids crash if native module isn't linked yet
      const Print = await import('expo-print');
      await Print.printAsync({
        html: imgHtml,
        width: 156,   // ~55 mm at 72 dpi  (no height limit — single continuous page)
      });
    } catch (error: any) {
      if (error?.message?.includes('Cannot find native module')) {
        Alert.alert(
          'Rebuild Required',
          'The print module is not linked yet.\n\nRun this once:\nnpx expo run:android',
        );
      } else {
        console.error('[ReceiptPrinter] print error:', error);
        Alert.alert('Print Error', 'Failed to open print dialog.');
      }
    } finally {
      setPrinting(false);
    }
  }, [effectivePayment, isMultiMode, monthLabel, transactionTime]);

  // ── Share as text ─────────────────────────────────────────
  const handleShare = useCallback(async () => {
    if (!payment) return;
    setSharing(true);
    try {
      const cashLine = (payment.cash_paid || 0) > 0
        ? `\nCash Paid: ${fmt(payment.cash_paid)}`
        : '';
      const balLabel = balance < 0 ? 'Carry Forward' : 'Balance';
      const balValue = balance < 0 ? fmt(Math.abs(balance)) : fmt(balance);

      const text = [
        '=== JOBAWU RECEIPT ===',
        '',
        `Tenant: ${payment.name}`,
        `Phone: ${maskPhone(payment.tenantPhone)}`,
        `House: ${payment.houseNo}`,
        `Month Paid: ${monthLabel}`,
        '',
        '--- Bill ---',
        `Base Rent: ${fmt(payment.baseRent)}`,
        `Garbage Fee: ${fmt(payment.garbageFees)}`,
        `Water (${payment.previousWaterUnits}→${payment.currentWaterUnits}): ${fmt(payment.waterBill)}`,
        `Total Bill: ${fmt(payment.total_amount)}`,
        '',
        '--- Payments ---',
        `Bank Paid: ${fmt(payment.bank_paid)}`,
        cashLine,
        `${balLabel}: ${balValue}`,
        '',
        payment.trans_id ? `Trans ID: ${payment.trans_id}` : '',
        `Served by Grace at ${transactionTime}`,
        '',
        'THANK YOU',
        '========================',
      ].filter(Boolean).join('\n');

      await Share.share(
        { message: text, title: 'Jobawu Receipt' },
        { dialogTitle: 'Share Receipt' },
      );
    } catch (error) {
      console.error('[ReceiptPrinter] share error:', error);
    } finally {
      setSharing(false);
    }
  }, [payment, monthLabel, transactionTime, balance]);

  // ── Styles ────────────────────────────────────────────────
  const ds = useMemo(() => StyleSheet.create({
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing.base,
    },
    modalCard: {
      backgroundColor: themedColors.background.primary,
      borderRadius: borderRadius.lg,
      width: '100%',
      maxWidth: 400,
      overflow: 'hidden',
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: spacing.base,
      borderBottomWidth: 1,
      borderBottomColor: themedColors.border.light,
    },
    modalTitle: {
      fontSize: typography.fontSize.lg,
      fontWeight: typography.fontWeight.bold as any,
      color: themedColors.text.primary,
    },
    closeText: {
      fontSize: typography.fontSize.xl,
      color: themedColors.text.secondary,
    },
    actionsRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      padding: spacing.base,
      borderTopWidth: 1,
      borderTopColor: themedColors.border.light,
    },
    printBtn: {
      flex: 2,
      backgroundColor: themedColors.primary[500],
      borderRadius: borderRadius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 44,
    },
    printBtnText: {
      color: '#FFFFFF',
      fontSize: typography.fontSize.base,
      fontWeight: typography.fontWeight.semibold as any,
    },
    shareBtn: {
      flex: 1,
      backgroundColor: themedColors.background.secondary,
      borderRadius: borderRadius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: themedColors.border.main,
      minHeight: 44,
    },
    shareBtnText: {
      color: themedColors.text.primary,
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.semibold as any,
    },
    closeBtn: {
      flex: 1,
      backgroundColor: themedColors.background.secondary,
      borderRadius: borderRadius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: themedColors.border.main,
      minHeight: 44,
    },
    closeBtnText: {
      color: themedColors.text.primary,
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.semibold as any,
    },
    receipt: {
      backgroundColor: '#FFFFFF',
      padding: spacing.lg,
      margin: spacing.base,
      borderRadius: borderRadius.md,
    },
    receiptMultiWrap: {
      backgroundColor: '#FFFFFF',
    },
    receiptSeparator: {
      height: 1,
      backgroundColor: '#CCCCCC',
      marginVertical: spacing.md,
    },
    logoContainer: {
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    logo: {
      width: 140,
      height: 140,
      resizeMode: 'contain',
    },
    tenantName: {
      fontSize: typography.fontSize['2xl'],
      fontWeight: typography.fontWeight.bold as any,
      color: '#1A1A1A',
      textAlign: 'center',
    },
    tenantDetail: {
      fontSize: typography.fontSize.lg,
      color: '#555555',
      textAlign: 'center',
      marginTop: 4,
    },
    hr: {
      height: 1,
      backgroundColor: '#CCCCCC',
      marginVertical: spacing.md,
    },
    lineItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 6,
    },
    lineLabel: {
      fontSize: typography.fontSize.lg,
      color: '#333333',
    },
    lineValue: {
      fontSize: typography.fontSize.lg,
      fontWeight: typography.fontWeight.semibold as any,
      color: '#1A1A1A',
    },
    footer: {
      marginTop: spacing.sm,
      alignItems: 'center',
    },
    footerText: {
      fontSize: typography.fontSize.lg,
      color: '#777777',
      textAlign: 'center',
    },
    thankYou: {
      fontSize: typography.fontSize['2xl'],
      fontWeight: typography.fontWeight.bold as any,
      color: '#1A1A1A',
      textAlign: 'center',
      marginTop: spacing.md,
      letterSpacing: 2,
    },
  }), [themedColors]);

  if (!effectivePayment && !isMultiMode) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={ds.modalOverlay}>
        <View style={ds.modalCard}>
          {/* Header */}
          <View style={ds.modalHeader}>
            <Text style={ds.modalTitle}>Receipt Preview</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={ds.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Receipt visual preview — captured as PNG for printing */}
          <ScrollView style={{ maxHeight: 480 }}>
            <View ref={receiptRef} collapsable={false} style={isMultiMode ? ds.receiptMultiWrap : undefined}>
              {isMultiMode
                ? payments!.map((p, idx) => (
                    <ReceiptBody key={p.id ?? idx} payment={p} ds={ds} isLast={idx === payments!.length - 1} />
                  ))
                : effectivePayment && (
                    <ReceiptBody payment={effectivePayment} ds={ds} />
                  )}
            </View>
          </ScrollView>

          {/* Action buttons: Close | Share | 🖨 Print */}
          <View style={ds.actionsRow}>
            <TouchableOpacity style={ds.closeBtn} onPress={onClose}>
              <Text style={ds.closeBtnText}>Close</Text>
            </TouchableOpacity>
            {!isMultiMode && (
              <TouchableOpacity
                style={ds.shareBtn}
                onPress={handleShare}
                disabled={sharing}
              >
                {sharing ? (
                  <ActivityIndicator color={themedColors.text.primary} size="small" />
                ) : (
                  <Text style={ds.shareBtnText}>📤 Share</Text>
                )}
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={ds.printBtn}
              onPress={handlePrint}
              disabled={printing}
            >
              {printing ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={ds.printBtnText}>
                  🖨️ {isMultiMode ? `Print All (${payments!.length})` : 'Print'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
