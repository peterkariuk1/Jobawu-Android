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
