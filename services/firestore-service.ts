/**
 * Firestore service for transaction operations.
 * All Firestore writes happen on the JS side using the Firebase JS SDK,
 * bypassing the native google-services.json dependency.
 */
import {
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    limit,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    updateDoc,
    where
} from 'firebase/firestore';
import { db } from '../firebaseConfig';

export interface TransactionRecord {
  id: string;
  amount: number;
  currency: string;
  recipientName: string;
  accountReference: string;
  mpesaReference: string;
  paymentMethod: string;
  senderName: string;
  senderPhone: string;
  transactionDate: string;
  transactionTime: string;
  rawMessage: string;
  smsSender: string;
  status: string;
  createdAt: number;
  reconciled: boolean;
  reconciledAt?: number | null;
}

export interface HouseUnit {
  houseNo: string;
  baseRent: number;
  garbageFees: number;
  previousWaterUnits: number;
  currentWaterUnits: number;
  tenant: string | null;
  // Tenant details
  tenantName?: string | null;
  tenantPhone?: string | null; // Stored in 254... format
  depositPaid?: number | null;
  monthRented?: number | null; // 1-12
  yearRented?: number | null; // e.g., 2026
}

export interface PlotRecord {
  id?: string;
  plotName: string;
  houses: HouseUnit[];
  numberOfUnits: number;
  totalRentAndGarbageExpected: number;
  createdAt?: any;
  updatedAt?: any;
}

const TRANSACTIONS_COLLECTION = 'transactions';
const PLOTS_COLLECTION = 'plots';

/**
 * Saves a transaction to Firestore.
 * Uses the transaction ID as doc ID for deduplication.
 */
export async function saveTransactionToFirestore(
  transaction: TransactionRecord
): Promise<{ success: boolean; id: string; error?: string }> {
  try {
    console.log('[FirestoreService] Saving transaction:', transaction.id);
    console.log('[FirestoreService] Amount:', transaction.amount, transaction.currency);

    const docRef = doc(db, TRANSACTIONS_COLLECTION, transaction.id);
    await setDoc(
      docRef,
      {
        ...transaction,
        savedAt: serverTimestamp(),
        savedFrom: 'js-sdk', // Track that this was saved via JS
      },
      { merge: true }
    );

    console.log('[FirestoreService] ✓ Transaction saved:', transaction.id);
    return { success: true, id: transaction.id };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[FirestoreService] ✗ Save failed:', msg);
    return { success: false, id: transaction.id, error: msg };
  }
}

/**
 * Gets all unreconciled transactions from Firestore.
 */
export async function getUnreconciledTransactions(): Promise<TransactionRecord[]> {
  try {
    const q = query(
      collection(db, TRANSACTIONS_COLLECTION),
      where('reconciled', '==', false),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as TransactionRecord));
  } catch (error) {
    console.error('[FirestoreService] Failed to get unreconciled:', error);
    return [];
  }
}

/**
 * Marks a transaction as reconciled in Firestore.
 */
export async function markTransactionReconciled(
  transactionId: string
): Promise<boolean> {
  try {
    const docRef = doc(db, TRANSACTIONS_COLLECTION, transactionId);
    await updateDoc(docRef, {
      reconciled: true,
      reconciledAt: Date.now(),
    });
    console.log('[FirestoreService] ✓ Reconciled:', transactionId);
    return true;
  } catch (error) {
    console.error('[FirestoreService] ✗ Reconcile failed:', error);
    return false;
  }
}

/**
 * Gets recent transactions from Firestore (for dashboard).
 */
export async function getRecentTransactions(
  count: number = 10
): Promise<TransactionRecord[]> {
  try {
    const q = query(
      collection(db, TRANSACTIONS_COLLECTION),
      orderBy('createdAt', 'desc'),
      limit(count)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as TransactionRecord));
  } catch (error) {
    console.error('[FirestoreService] Failed to get recent:', error);
    return [];
  }
}

/**
 * Get all plots from Firestore
 */
export async function getAllPlots(): Promise<PlotRecord[]> {
  try {
    const snapshot = await getDocs(collection(db, PLOTS_COLLECTION));
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as PlotRecord));
  } catch (error) {
    console.error('[FirestoreService] Failed to get plots:', error);
    return [];
  }
}

/**
 * Save (create or update) a plot to Firestore
 */
export async function savePlot(plot: PlotRecord): Promise<{ success: boolean; id: string; error?: string }> {
  try {
    if (plot.id) {
      // Update existing plot
      const docRef = doc(db, PLOTS_COLLECTION, plot.id);
      await updateDoc(docRef, {
        ...plot,
        updatedAt: serverTimestamp(),
      });
      console.log('[FirestoreService] ✓ Plot updated:', plot.id);
      return { success: true, id: plot.id };
    } else {
      // Create new plot
      const docRef = doc(collection(db, PLOTS_COLLECTION));
      await setDoc(docRef, {
        ...plot,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      console.log('[FirestoreService] ✓ Plot created:', docRef.id);
      return { success: true, id: docRef.id };
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[FirestoreService] ✗ Save plot failed:', msg);
    return { success: false, id: plot.id || '', error: msg };
  }
}

/**
 * Delete a plot from Firestore
 */
export async function deletePlot(plotId: string): Promise<boolean> {
  try {
    const docRef = doc(db, PLOTS_COLLECTION, plotId);
    await deleteDoc(docRef);
    console.log('[FirestoreService] ✓ Plot deleted:', plotId);
    return true;
  } catch (error) {
    console.error('[FirestoreService] ✗ Delete plot failed:', error);
    return false;
  }
}

/**
 * Update a plot in Firestore
 */
export async function updatePlot(plotId: string, updates: Partial<PlotRecord>): Promise<boolean> {
  try {
    const docRef = doc(db, PLOTS_COLLECTION, plotId);
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    });
    console.log('[FirestoreService] ✓ Plot updated:', plotId);
    return true;
  } catch (error) {
    console.error('[FirestoreService] ✗ Update plot failed:', error);
    return false;
  }
}

/**
 * Assign a tenant to a specific house unit
 * Converts phone number from 0... format to 254... format
 */
export async function assignTenantToUnit(
  plotId: string,
  houseNo: string,
  tenantData: {
    tenantName: string;
    phoneNumber: string; // Receives in 0... format
    depositPaid: number;
    monthRented: number;
    yearRented: number;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    // Convert phone number from 0... to 254... format
    let formattedPhone = tenantData.phoneNumber;
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '254' + formattedPhone.substring(1);
    }

    // Fetch the plot
    const plotDoc = await getDoc(doc(db, PLOTS_COLLECTION, plotId));
    if (!plotDoc.exists()) {
      return { success: false, error: 'Plot not found' };
    }

    const plot = plotDoc.data() as PlotRecord;
    
    // Update the specific house unit
    const updatedHouses = plot.houses.map(house => {
      if (house.houseNo === houseNo) {
        return {
          ...house,
          tenant: tenantData.tenantName,
          tenantName: tenantData.tenantName,
          tenantPhone: formattedPhone,
          depositPaid: tenantData.depositPaid,
          monthRented: tenantData.monthRented,
          yearRented: tenantData.yearRented,
        };
      }
      return house;
    });

    // Update the plot in Firestore
    await updateDoc(doc(db, PLOTS_COLLECTION, plotId), {
      houses: updatedHouses,
      updatedAt: serverTimestamp(),
    });

    console.log('[FirestoreService] ✓ Tenant assigned to unit:', houseNo, 'in plot:', plotId);
    return { success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[FirestoreService] ✗ Assign tenant failed:', msg);
    return { success: false, error: msg };
  }
}

/**
 * Remove a tenant from a specific house unit
 */
export async function removeTenantFromUnit(
  plotId: string,
  houseNo: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Fetch the plot
    const plotDoc = await getDoc(doc(db, PLOTS_COLLECTION, plotId));
    if (!plotDoc.exists()) {
      return { success: false, error: 'Plot not found' };
    }

    const plot = plotDoc.data() as PlotRecord;
    
    // Update the specific house unit to remove tenant
    const updatedHouses = plot.houses.map(house => {
      if (house.houseNo === houseNo) {
        return {
          ...house,
          tenant: null,
          tenantName: null,
          tenantPhone: null,
          depositPaid: null,
          monthRented: null,
          yearRented: null,
        };
      }
      return house;
    });

    // Update the plot in Firestore
    await updateDoc(doc(db, PLOTS_COLLECTION, plotId), {
      houses: updatedHouses,
      updatedAt: serverTimestamp(),
    });

    console.log('[FirestoreService] ✓ Tenant removed from unit:', houseNo, 'in plot:', plotId);
    return { success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[FirestoreService] ✗ Remove tenant failed:', msg);
    return { success: false, error: msg };
  }
}

/**
 * Update tenant details for a specific house unit
 * Converts phone number from 0... format to 254... format
 */
export async function updateTenantInUnit(
  plotId: string,
  houseNo: string,
  tenantData: {
    tenantName: string;
    phoneNumber: string; // Receives in 0... format
    monthRented: number;
    yearRented: number;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    let formattedPhone = tenantData.phoneNumber;
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '254' + formattedPhone.substring(1);
    }

    const plotDoc = await getDoc(doc(db, PLOTS_COLLECTION, plotId));
    if (!plotDoc.exists()) {
      return { success: false, error: 'Plot not found' };
    }

    const plot = plotDoc.data() as PlotRecord;

    const updatedHouses = plot.houses.map(house => {
      if (house.houseNo === houseNo) {
        return {
          ...house,
          tenant: tenantData.tenantName,
          tenantName: tenantData.tenantName,
          tenantPhone: formattedPhone,
          monthRented: tenantData.monthRented,
          yearRented: tenantData.yearRented,
        };
      }
      return house;
    });

    await updateDoc(doc(db, PLOTS_COLLECTION, plotId), {
      houses: updatedHouses,
      updatedAt: serverTimestamp(),
    });

    console.log('[FirestoreService] ✓ Tenant updated for unit:', houseNo, 'in plot:', plotId);
    return { success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[FirestoreService] ✗ Update tenant failed:', msg);
    return { success: false, error: msg };
  }
}

// ============================================================
// Payment / Billing
// ============================================================

const PAYMENTS_COLLECTION = 'payments';

export interface PaymentRecord {
  id?: string;
  plotId: string;
  plotName: string;
  houseNo: string;
  name: string;           // tenant name
  tenantPhone: string;
  month: number;           // 1-12
  year: number;
  baseRent: number;
  garbageFees: number;
  previousWaterUnits: number;
  currentWaterUnits: number;
  waterBill: number;       // (current - previous) * 22
  total_amount: number;    // baseRent + garbageFees + waterBill - carryForward
  paid: boolean;
  bank_paid: number;
  cash_paid: number;
  balance: number;         // total_amount - (bank_paid + cash_paid); negative = overpaid
  carryForward: number;    // overpayment from previous month
  month_paid: string;      // e.g. "February 2026"
  trans_id: string;
  time: any;
  createdAt?: any;
  updatedAt?: any;
}

/**
 * Get all payments for a specific plot and month/year
 */
export async function getPaymentsForPlotMonth(
  plotId: string,
  month: number,
  year: number
): Promise<PaymentRecord[]> {
  try {
    const q = query(
      collection(db, PAYMENTS_COLLECTION),
      where('plotId', '==', plotId),
      where('month', '==', month),
      where('year', '==', year)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as PaymentRecord));
  } catch (error) {
    console.error('[FirestoreService] Failed to get payments for plot month:', error);
    return [];
  }
}

/**
 * Get all payments across all plots for a given month/year
 */
export async function getAllPaymentsForMonth(
  month: number,
  year: number
): Promise<PaymentRecord[]> {
  try {
    const q = query(
      collection(db, PAYMENTS_COLLECTION),
      where('month', '==', month),
      where('year', '==', year)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as PaymentRecord));
  } catch (error) {
    console.error('[FirestoreService] Failed to get all payments for month:', error);
    return [];
  }
}

/**
 * Listen in real-time to all payments for a given month/year.
 * The callback fires on every change (add/modify/remove) so the UI can
 * automatically reflect newly-paid or updated bills.
 *
 * Returns an unsubscribe function.
 */
export function listenToPaymentsForMonth(
  month: number,
  year: number,
  callback: (payments: PaymentRecord[]) => void
): () => void {
  const q = query(
    collection(db, PAYMENTS_COLLECTION),
    where('month', '==', month),
    where('year', '==', year)
  );

  const unsubscribe = onSnapshot(q, (snapshot: any) => {
    const payments = snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() } as PaymentRecord));
    callback(payments);
  }, (error: any) => {
    console.error('[FirestoreService] Payments listener error:', error);
  });

  return unsubscribe;
}

/**
 * Create a new bill (payment doc with paid=false).
 * Uses composite key plotId_houseNo_month_year for deduplication.
 */
export async function createBill(
  data: Omit<PaymentRecord, 'id'>
): Promise<{ success: boolean; id: string; error?: string }> {
  try {
    const docId = `${data.plotId}_${data.houseNo}_${data.month}_${data.year}`;
    const docRef = doc(db, PAYMENTS_COLLECTION, docId);

    // Prevent duplicates
    const existing = await getDoc(docRef);
    if (existing.exists()) {
      return { success: false, id: docId, error: 'Bill already exists for this unit and month' };
    }

    await setDoc(docRef, {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    console.log('[FirestoreService] ✓ Bill created:', docId);
    return { success: true, id: docId };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[FirestoreService] ✗ Create bill failed:', msg);
    return { success: false, id: '', error: msg };
  }
}

/**
 * Update a payment record (e.g. mark as paid, update amounts)
 */
export async function updatePaymentRecord(
  paymentId: string,
  updates: Partial<PaymentRecord>
): Promise<boolean> {
  try {
    const docRef = doc(db, PAYMENTS_COLLECTION, paymentId);
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    });
    console.log('[FirestoreService] ✓ Payment updated:', paymentId);
    return true;
  } catch (error) {
    console.error('[FirestoreService] ✗ Update payment failed:', error);
    return false;
  }
}

/**
 * After billing, update the house unit's water readings on the plot doc
 * so the next month uses the new "previous" reading.
 */
export async function updateHouseWaterUnits(
  plotId: string,
  houseNo: string,
  newCurrentWaterUnits: number
): Promise<boolean> {
  try {
    const plotDoc = await getDoc(doc(db, PLOTS_COLLECTION, plotId));
    if (!plotDoc.exists()) return false;

    const plot = plotDoc.data() as PlotRecord;
    const updatedHouses = plot.houses.map(house => {
      if (house.houseNo === houseNo) {
        return {
          ...house,
          previousWaterUnits: newCurrentWaterUnits,
          currentWaterUnits: newCurrentWaterUnits,
        };
      }
      return house;
    });

    await updateDoc(doc(db, PLOTS_COLLECTION, plotId), {
      houses: updatedHouses,
      updatedAt: serverTimestamp(),
    });

    console.log('[FirestoreService] ✓ Water units updated for', houseNo, 'in plot', plotId);
    return true;
  } catch (error) {
    console.error('[FirestoreService] ✗ Update water units failed:', error);
    return false;
  }
}

/**
 * Look up the previous month's payment for a tenant to find carry-forward credit.
 * Returns the absolute overpayment amount (positive number) or 0.
 */
export async function getCarryForward(
  plotId: string,
  houseNo: string,
  month: number,
  year: number
): Promise<number> {
  try {
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;

    const docId = `${plotId}_${houseNo}_${prevMonth}_${prevYear}`;
    const docRef = doc(db, PAYMENTS_COLLECTION, docId);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      const data = snap.data() as PaymentRecord;
      if (data.balance < 0) {
        return Math.abs(data.balance); // overpayment is a positive credit
      }
    }
    return 0;
  } catch (error) {
    console.error('[FirestoreService] Failed to get carry forward:', error);
    return 0;
  }
}

// ============================================================
// Real-time transaction listener & auto-reconciliation
// ============================================================

/**
 * Listen in real-time to the transactions collection.
 * Returns an unsubscribe function.
 *
 * The callback receives all new / changed transactions so the consumer
 * can reconcile them against existing bills.
 */
export function listenToTransactions(
  callback: (transactions: TransactionRecord[]) => void
): () => void {
  const q = query(
    collection(db, TRANSACTIONS_COLLECTION),
    where('reconciled', '==', false),
    orderBy('createdAt', 'desc'),
    limit(100)
  );

  const unsubscribe = onSnapshot(q, (snapshot: any) => {
    const txns = snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() } as TransactionRecord));
    callback(txns);
  }, (error: any) => {
    console.error('[FirestoreService] Transaction listener error:', error);
  });

  return unsubscribe;
}

/**
 * Attempt to match an incoming bank transaction to an unpaid bill
 * using the sender's phone number.
 *
 * Returns the payment id that was updated, or null if no match.
 */
export async function reconcileTransactionToBill(
  transaction: TransactionRecord,
  month: number,
  year: number
): Promise<string | null> {
  try {
    const senderPhone = transaction.senderPhone; // already 254... format
    if (!senderPhone) return null;

    // Find all unpaid bills for the given month/year with this phone number
    const q = query(
      collection(db, PAYMENTS_COLLECTION),
      where('tenantPhone', '==', senderPhone),
      where('month', '==', month),
      where('year', '==', year)
    );

    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;

    // Take the first matching unpaid bill
    const billDoc = snapshot.docs[0];
    const bill = { id: billDoc.id, ...billDoc.data() } as PaymentRecord;

    const newBankPaid = (bill.bank_paid || 0) + transaction.amount;
    const totalPaid = newBankPaid + (bill.cash_paid || 0);
    const newBalance = bill.total_amount - totalPaid;
    const isPaid = newBalance <= 0;

    await updateDoc(doc(db, PAYMENTS_COLLECTION, billDoc.id), {
      bank_paid: newBankPaid,
      balance: newBalance,
      paid: isPaid,
      trans_id: transaction.id,
      month_paid: isPaid ? `${MONTH_NAMES_SVC[month - 1]} ${year}` : bill.month_paid,
      time: isPaid ? serverTimestamp() : bill.time,
      updatedAt: serverTimestamp(),
    });

    // Mark transaction as reconciled
    await markTransactionReconciled(transaction.id);

    console.log(
      `[FirestoreService] ✓ Reconciled txn ${transaction.id} → bill ${billDoc.id}, balance: ${newBalance}`
    );
    return billDoc.id;
  } catch (error) {
    console.error('[FirestoreService] ✗ reconcileTransactionToBill failed:', error);
    return null;
  }
}

const MONTH_NAMES_SVC = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * When a bank payment arrives but no bill exists yet, auto-create a bill
 * from the tenant's plot data and apply the payment.
 */
export async function autoCreateBillFromTransaction(
  transaction: TransactionRecord,
  month: number,
  year: number
): Promise<string | null> {
  try {
    const senderPhone = transaction.senderPhone;
    if (!senderPhone) return null;

    // Search all plots for a tenant with this phone number
    const allPlots = await getAllPlots();
    let matchedPlot: PlotRecord | null = null;
    let matchedUnit: HouseUnit | null = null;

    for (const plot of allPlots) {
      const unit = plot.houses.find(h => h.tenantPhone === senderPhone);
      if (unit) {
        matchedPlot = plot;
        matchedUnit = unit;
        break;
      }
    }

    if (!matchedPlot || !matchedUnit) return null;

    // Check if a bill already exists
    const docId = `${matchedPlot.id}_${matchedUnit.houseNo}_${month}_${year}`;
    const existingDoc = await getDoc(doc(db, PAYMENTS_COLLECTION, docId));
    if (existingDoc.exists()) {
      // Bill exists — just reconcile the transaction to it
      return reconcileTransactionToBill(transaction, month, year);
    }

    // Look up carry-forward
    const carryFwd = await getCarryForward(matchedPlot.id!, matchedUnit.houseNo, month, year);

    // Use current water readings (no new meter reading)
    const waterBill = 0; // water not billed until manually entered
    const grossTotal = matchedUnit.baseRent + matchedUnit.garbageFees + waterBill;
    const totalAmount = Math.max(0, grossTotal - carryFwd);
    const totalPaid = transaction.amount;
    const newBalance = totalAmount - totalPaid;
    const isPaid = newBalance <= 0;

    const billData: Omit<PaymentRecord, 'id'> = {
      plotId: matchedPlot.id!,
      plotName: matchedPlot.plotName,
      houseNo: matchedUnit.houseNo,
      name: matchedUnit.tenantName || '',
      tenantPhone: senderPhone,
      month,
      year,
      baseRent: matchedUnit.baseRent,
      garbageFees: matchedUnit.garbageFees,
      previousWaterUnits: matchedUnit.previousWaterUnits,
      currentWaterUnits: matchedUnit.currentWaterUnits,
      waterBill,
      total_amount: totalAmount,
      paid: isPaid,
      bank_paid: totalPaid,
      cash_paid: 0,
      balance: newBalance,
      carryForward: carryFwd,
      month_paid: isPaid ? `${MONTH_NAMES_SVC[month - 1]} ${year}` : '',
      trans_id: transaction.id,
      time: isPaid ? serverTimestamp() : null,
    };

    await setDoc(doc(db, PAYMENTS_COLLECTION, docId), {
      ...billData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Mark transaction reconciled
    await markTransactionReconciled(transaction.id);

    console.log('[FirestoreService] ✓ Auto-created bill from txn:', docId);
    return docId;
  } catch (error) {
    console.error('[FirestoreService] ✗ autoCreateBillFromTransaction failed:', error);
    return null;
  }
}

/**
 * Create a bill OR update an existing one (upsert).
 * Useful when we need to save water changes on a bill that was auto-created.
 */
export async function upsertBill(
  data: Omit<PaymentRecord, 'id'>
): Promise<{ success: boolean; id: string; error?: string }> {
  try {
    const docId = `${data.plotId}_${data.houseNo}_${data.month}_${data.year}`;
    const docRef = doc(db, PAYMENTS_COLLECTION, docId);

    await setDoc(docRef, {
      ...data,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    console.log('[FirestoreService] ✓ Bill upserted:', docId);
    return { success: true, id: docId };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[FirestoreService] ✗ Upsert bill failed:', msg);
    return { success: false, id: '', error: msg };
  }
}
