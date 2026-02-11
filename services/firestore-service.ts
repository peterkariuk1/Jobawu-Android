/**
 * Firestore service for transaction operations.
 * All Firestore writes happen on the JS side using the Firebase JS SDK,
 * bypassing the native google-services.json dependency.
 */
import { db } from '@/firebaseConfig';
import {
    collection,
    doc,
    getDocs,
    limit,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    updateDoc,
    where
} from 'firebase/firestore';

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

const TRANSACTIONS_COLLECTION = 'transactions';

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
