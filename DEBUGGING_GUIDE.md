# SMS Reconciliation Debugging Guide

## Problem: Not Receiving Live SMS Messages

If the test buttons work but real SMS messages aren't being captured, follow these steps:

## Step 1: Check the Debug Panel in App

1. Open the **Reconciliation** tab in your app
2. Look at the blue **🐛 DEBUG INFO** panel at the top
3. Verify all items show ✅:
   - SMS Permission: ✅
   - SMS Read: ✅  
   - Post Notifications: ✅
   - Boot Permission: ✅
   - Listening: YES

If any show ❌, tap "Request Permissions" and grant all permissions.

## Step 2: Check Battery Optimization

**Android kills background services to save battery!** This is the #1 reason SMS isn't captured.

### Disable Battery Optimization:
1. Go to **Settings** → **Apps** → **Jobawu**
2. Tap **Battery** (or **Power**)
3. Select **"Unrestricted"** or **"Don't optimize"**
4. Also check: **Settings** → **Battery** → **Battery Optimization**
   - Find **Jobawu** and set to **"Don't optimize"**

### Brand-Specific Settings:
- **Samsung**: Disable "Put app to sleep" in Settings → Battery
- **Xiaomi/MIUI**: Settings → Permissions → Autostart → Enable for Jobawu
- **Huawei/EMUI**: Settings → Battery → App launch → Manage manually for Jobawu
- **OnePlus/Oppo**: Settings → Battery → Battery optimization → Disable for Jobawu
- **Vivo**: Settings → Battery → Background power consumption → High power consumption in background

## Step 3: View Android Logs (Requires Computer)

### Option A: USB Debugging (Easiest)

1. **Enable Developer Mode** on your phone:
   - Go to **Settings** → **About Phone**
   - Tap **Build Number** 7 times
   - Enter your PIN if prompted

2. **Enable USB Debugging**:
   - Go to **Settings** → **Developer Options**
   - Enable **USB Debugging**

3. **Connect Phone to Computer** via USB cable

4. **Open Terminal/PowerShell** on your computer:
   ```powershell
   # Navigate to Android SDK platform-tools
   cd C:\Users\YOUR_USERNAME\AppData\Local\Android\Sdk\platform-tools
   
   # Verify phone is connected
   .\adb devices
   
   # Start watching logs (live view)
   .\adb logcat | Select-String "EquitySms|SmsReceiver|SmsListenerService"
   ```

5. **Send yourself a test SMS** from Equity Bank (or ask someone to M-PESA you)

6. **Watch the logs** - You should see:
   ```
   EquitySmsReceiver: ▓▓▓ SMS RECEIVER TRIGGERED!
   EquitySmsReceiver: >>> FROM: EQUITYBANK
   EquitySmsReceiver: >>> BODY: Confirmed KES...
   SmsListenerService: >>> Transaction ID: ...
   ```

### Option B: Wireless Debugging (No Cable - Android 11+)

1. **Enable Wireless Debugging**:
   - Settings → Developer Options → Wireless Debugging → Enable
   - Tap **"Pair device with pairing code"**
   - Note the **IP address** and **Port**

2. **Pair from Computer**:
   ```powershell
   cd C:\Users\YOUR_USERNAME\AppData\Local\Android\Sdk\platform-tools
   .\adb pair IP_ADDRESS:PORT
   # Enter the 6-digit code from your phone
   
   .\adb connect IP_ADDRESS:PORT
   .\adb logcat | Select-String "EquitySms|SmsReceiver|SmsListenerService"
   ```

## Step 4: Check What Logs Should Show

When an SMS arrives, you should see this sequence:

1. **SMS Received**:
   ```
   SmsReceiver: ▓▓▓ SMS RECEIVER TRIGGERED!
   SmsReceiver: >>> FROM: EQUITYBANK (or pjeykrs2)
   SmsReceiver: >>> BODY (XXX chars): Confirmed KES...
   SmsReceiver: >>> Sender 'EQUITYBANK' allowed: true
   ```

2. **Parse Successful**:
   ```
   SmsParser: Parsing SMS from: EQUITYBANK
   SmsParser: ✓ PARSED successfully
   ```

3. **Service Processes**:
   ```
   SmsListenerService: ▓▓▓ SERVICE: TRANSACTION FROM RECEIVER!
   SmsListenerService: >>> Transaction ID: ...
   SmsListenerService: >>> Step 1: Saving to local storage...
   SmsListenerService: >>> ✓ Saved to local storage
   ```

4. **Firestore Sync**:
   ```
   FirestoreRepository: Saving transaction to Firestore: TX_...
   FirestoreRepository: ✓ Transaction saved successfully
   ```

## Step 5: Common Issues & Fixes

### Issue: "SMS RECEIVER NOT TRIGGERED" - No logs at all
**Cause**: Service isn't running or receiver not registered
**Fix**:
1. Force stop the app
2. Clear app data: Settings → Apps → Jobawu → Storage → Clear Data
3. Reopen app and grant ALL permissions
4. Check that "Listening: YES" shows in debug panel

### Issue: Receiver triggers but "sender not in list"
**Cause**: SMS sender name doesn't match allowed list
**Fix**: Check the log for actual sender name, add it to `ALLOWED_SENDERS` in SmsReceiver.kt

### Issue: Parse fails
**Cause**: SMS format doesn't match the parser
**Fix**: 
1. Use the "Test Parse" button with real SMS text
2. Check logs to see what format is expected

### Issue: "Service destroyed" or "Service killed"
**Cause**: System killed service due to battery optimization
**Fix**: Go back to Step 2 and disable battery optimization

### Issue: Works sometimes, not others
**Cause**: App is being put to sleep by aggressive battery management
**Fix**:
1. Disable all battery optimization (Step 2)
2. Restart phone
3. Open app and ensure service starts

## Step 6: Testing Without Logcat

If you can't use logcat, use the in-app debug panel:

1. Open Reconciliation tab
2. Watch the debug panel closely
3. Send yourself a real Equity Bank SMS
4. The transaction count should increase within 1-2 seconds
5. If it doesn't:
   - Tap "Stop Listening" then "Start Listening" 
   - Check that all permissions show ✅
   - Try the "Test & Save" button to verify parsing works

## Step 7: Manual Service Restart

If service seems stuck:

```
1. Force Stop App:
   Settings → Apps → Jobawu → Force Stop

2. Restart Phone (yes, really - it helps!)

3. Open app, go to Reconciliation tab

4. Watch debug panel - "Listening: YES" should appear

5. Try sending yourself an SMS
```

## Step 8: Check Android Version Compatibility

- **Minimum**: Android 8.0 (API 26)
- **Tested**: Android 10-14
- **Android 14+**: May have extra restrictions - ensure all permissions granted

## Need More Help?

Check the logs! They contain detailed information about:
- ✅ When SMS arrives
- ✅ Why it was accepted/rejected
- ✅ If parsing succeeded
- ✅ If Firestore save worked
- ✅ Any errors

**All logging uses** the tags: `EquitySmsReceiver`, `SmsListenerService`, `SmsParser`, `FirestoreRepository`

Filter logs with:
```powershell
adb logcat | Select-String "EquitySms"
```
