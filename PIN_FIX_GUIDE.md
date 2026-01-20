# 🔐 PIN CODE FIX - Apps Script Update

## Issue: Hardcoded PIN instead of Config Sheet

**Current Behavior**: PIN is hardcoded as '1234' in Code.gs
**Expected Behavior**: PIN should read '2001' from Config sheet
**Your Config Sheet**: https://docs.google.com/spreadsheets/d/1LI9lVHqDvCvJDS3gCJDc5L_x4NGf4NSS-7A572h_x2U/edit?gid=830180492

---

## 🐛 THE PROBLEM

In `appsscript/Code.gs`:

```javascript
// Line 18 - Hardcoded PIN
const CONFIG = {
  OPERATOR_PIN: '1234',  // ← This is wrong!
  ...
};

// Line 111-113 - Uses hardcoded value
function verifyPin(pin) {
  const isValid = pin === CONFIG.OPERATOR_PIN;  // ← Checks '1234', not Config sheet
  return { success: isValid };
}
```

---

## ✅ THE FIX

Replace the `verifyPin` function (lines 108-113) with this updated version:

```javascript
// ===== PIN VERIFICATION =====

/**
 * Verify operator PIN against value stored in Config sheet
 * Reads from Config sheet > Row with "Operator Code" label
 */
function verifyPin(pin) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const configSheet = ss.getSheetByName(CONFIG.SHEETS.CONFIG);
    
    if (!configSheet) {
      // Fallback to hardcoded PIN if Config sheet doesn't exist
      Logger.log('Config sheet not found, using hardcoded PIN');
      return { success: pin === CONFIG.OPERATOR_PIN };
    }
    
    // Get all data from Config sheet
    const data = configSheet.getDataRange().getValues();
    
    // Find the row with "Operator Code" label
    let operatorPin = CONFIG.OPERATOR_PIN; // fallback
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      // Check first column for "Operator Code" label (case-insensitive)
      if (row[0] && row[0].toString().toLowerCase().includes('operator')) {
        // PIN should be in second column (column B)
        operatorPin = row[1] ? row[1].toString() : CONFIG.OPERATOR_PIN;
        Logger.log('Found Operator Code in Config sheet: ' + operatorPin);
        break;
      }
    }
    
    const isValid = pin === operatorPin;
    return { 
      success: isValid,
      message: isValid ? 'PIN verified' : 'Invalid PIN'
    };
    
  } catch (error) {
    Logger.log('verifyPin error: ' + error.toString());
    // Fallback to hardcoded PIN on error
    return { 
      success: pin === CONFIG.OPERATOR_PIN,
      error: 'Config sheet read failed, using fallback'
    };
  }
}
```

---

## 📋 HOW TO UPDATE APPS SCRIPT

### Step 1: Open Apps Script Editor

1. Go to: https://script.google.com
2. Open your "Granny Gear Workshop" project
   OR
3. From the spreadsheet: Extensions → Apps Script

### Step 2: Find the verifyPin Function

1. Open `Code.gs` file
2. Scroll to line ~108-113
3. Look for:
   ```javascript
   function verifyPin(pin) {
     const isValid = pin === CONFIG.OPERATOR_PIN;
     return { success: isValid };
   }
   ```

### Step 3: Replace with New Function

1. Select the old `verifyPin` function (including the comment above it)
2. Delete it
3. Paste the new version from above
4. Click **Save** (Ctrl+S)

### Step 4: Deploy New Version

1. Click **Deploy** → **Manage deployments**
2. Click **✏️ Edit** on your active deployment
3. Under "Version", select **New version**
4. Add description: "Read PIN from Config sheet"
5. Click **Deploy**
6. Copy the new Web App URL (if it changed)

### Step 5: Test the Fix

**Test in Apps Script:**
```javascript
// Run this function in Apps Script editor
function testPinVerification() {
  console.log('Testing PIN 2001:', verifyPin('2001'));  // Should return { success: true }
  console.log('Testing PIN 1234:', verifyPin('1234'));  // Should return { success: false }
  console.log('Testing PIN 0000:', verifyPin('0000'));  // Should return { success: false }
}
```

**Test from Website:**
1. Clear browser cache
2. Go to https://ggwa.pages.dev
3. Click "Job Cart Manager"
4. Enter PIN: **2001**
5. Should login successfully ✅

---

## 📊 WHAT THE FIX DOES

### New Behavior:
1. **Reads Config sheet** from your Google Spreadsheet
2. **Finds the row** with "Operator Code" label (column A)
3. **Gets PIN value** from column B (should be 2001)
4. **Compares** entered PIN with value from sheet
5. **Falls back** to hardcoded '1234' if Config sheet can't be read

### Safety Features:
- ✅ Fallback to hardcoded PIN if Config sheet missing
- ✅ Fallback to hardcoded PIN if read error
- ✅ Case-insensitive search for "operator" label
- ✅ Logs what PIN it finds for debugging

---

## 🧪 VERIFY YOUR CONFIG SHEET

Make sure your Config sheet looks like this:

| Column A (Label)       | Column B (Value) |
|------------------------|------------------|
| Operator Code          | 2001             |
| LastJobNumber          | 10               |
| (other config items)   | (values)         |

**Requirements:**
- ✅ Tab name must be: `Config`
- ✅ Column A must contain: "Operator Code" (or "operator code" - case insensitive)
- ✅ Column B must contain: `2001` (as text or number)

---

## 🚨 TROUBLESHOOTING

### Issue: Still asks for 1234

**Possible causes:**
1. Apps Script not redeployed with new version
2. Browser cache still has old code
3. Config sheet doesn't have "Operator Code" label
4. PIN value in Config sheet is not in column B

**Solutions:**
1. Redeploy Apps Script with "New version"
2. Clear browser cache completely
3. Check Config sheet structure matches above
4. Run `testPinVerification()` in Apps Script to see logs

### Issue: PIN verification fails for 2001

**Check:**
1. Open Apps Script → **Executions**
2. Find recent `verifyPin` execution
3. Check logs for:
   - "Found Operator Code in Config sheet: 2001" ✅
   - "Config sheet not found" ❌
   - Error messages ❌

### Issue: Can still login with 1234

**This means**: Apps Script is using the fallback (hardcoded PIN)

**Fix:**
1. Verify Config sheet exists
2. Verify "Operator Code" row exists
3. Check Apps Script logs for errors
4. Redeploy with new version

---

## ✅ AFTER THE FIX

**Working PIN**: 2001 (from Config sheet)
**Fallback PIN**: 1234 (if Config sheet unreadable)

**Test both:**
- ✅ Enter 2001 → Should login
- ❌ Enter 1234 → Should fail (unless fallback active)
- ❌ Enter 0000 → Should fail

---

## 📝 OPTIONAL: Change Hardcoded Fallback

If you want to change the fallback PIN from 1234:

```javascript
// Line 18 in Code.gs
const CONFIG = {
  SPREADSHEET_ID: '1LI9lVHqDvCvJDS3gCJDc5L_x4NGf4NSS-7A572h_x2U',
  OPERATOR_PIN: '2001',  // ← Change this to match Config sheet
  ...
};
```

This ensures the fallback matches your actual PIN.

---

## 🎯 SUMMARY

**Before Fix**:
- PIN hardcoded as 1234
- Config sheet ignored
- Can't change PIN without redeploying Apps Script

**After Fix**:
- PIN read from Config sheet (2001)
- Can change PIN by editing spreadsheet
- No redeploy needed for PIN changes
- Fallback to hardcoded value if errors

**Status**: ✅ READY TO UPDATE