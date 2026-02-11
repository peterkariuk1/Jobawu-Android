/**
 * Firebase Configuration for Jobawu
 *
 * Note: For the SMS reconciliation feature, Firebase is initialized natively
 * via google-services.json in the equity-sms module. This config is for any
 * JavaScript-side Firebase operations if needed.
 */
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Firebase configuration from google-services.json
// Project: jobamob-2d643
const firebaseConfig = {
  apiKey: 'AIzaSyBUaB3lB0VPJCJK-udPO2mRHL-9NpDwuVs',
  authDomain: 'jobamob-2d643.firebaseapp.com',
  projectId: 'jobamob-2d643',
  storageBucket: 'jobamob-2d643.firebasestorage.app',
  messagingSenderId: '838860349462',
  appId: '1:838860349462:android:915c1ea006afc10f401537',
};

// Initialize Firebase (prevent re-initialization)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Firestore instance
export const db = getFirestore(app);

export default app;