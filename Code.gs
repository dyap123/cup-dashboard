function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  var ss = SpreadsheetApp.openById('1fTL_w-kLz0Jzwni9r3kSuGqSvlsFhNm0RsfRurQH750');
  var sheet = ss.getSheetByName('Pour Takeoff');

  if (data.ordered !== undefined) {
    return handleOrdered(sheet, data);
  }

  if (data.action === 'updateField') {
    return handleFieldUpdate(sheet, data);
  }

  return ContentService.createTextOutput(JSON.stringify({ok:true}))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleFieldUpdate(sheet, data) {
  var pourId = data.pourId;
  var field = data.field;
  var value = data.value;

  // For dates: column C (3) is the same in both detail and summary sections
  // For quantities: only update ORDER SUMMARY (detail section has different column layout)
  var summaryCol = { date: 3, cy8000: 4, cy5000: 5, slurry: 6 };
  var col = summaryCol[field];

  if (!col) {
    return ContentService.createTextOutput(JSON.stringify({error:'invalid field'}))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var dataRange = sheet.getDataRange();
  var values = dataRange.getValues();
  var found = false;
  var inOrderSummary = false;

  for (var i = 0; i < values.length; i++) {
    var cellA = String(values[i][0]).trim();

    if (cellA === 'ORDER SUMMARY') {
      inOrderSummary = true;
      continue;
    }

    // For date changes, also update the detail section rows (date is col C everywhere)
    if (!inOrderSummary && field === 'date' && cellA === pourId) {
      sheet.getRange(i + 1, 3).setValue(value);
    }

    if (!inOrderSummary) continue;

    // Update ORDER SUMMARY row
    if (cellA === pourId) {
      var writeVal = value;
      if (field !== 'date' && !isNaN(Number(value))) {
        writeVal = Number(value);
      }
      sheet.getRange(i + 1, col).setValue(writeVal);
      found = true;
      break;
    }
    if (cellA === 'GRAND TOTAL') break;
  }

  return ContentService.createTextOutput(JSON.stringify({ok:true, found:found}))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleOrdered(sheet, data) {
  var pourId = data.pourId;
  var ordered = data.ordered;
  var dataRange = sheet.getDataRange();
  var values = dataRange.getValues();
  var inOrderSummary = false;

  for (var i = 0; i < values.length; i++) {
    var cellA = String(values[i][0]).trim();
    if (cellA === 'ORDER SUMMARY') {
      inOrderSummary = true;
      continue;
    }
    if (!inOrderSummary) continue;
    if (cellA === pourId) {
      sheet.getRange(i + 1, 9).setValue(ordered ? 'YES' : '');
      break;
    }
    if (cellA === 'GRAND TOTAL') break;
  }

  return ContentService.createTextOutput(JSON.stringify({ok:true}))
    .setMimeType(ContentService.MimeType.JSON);
}

// Run this manually from the Apps Script editor to clean up sheet formatting
// Menu: Run > formatSheet
function formatSheet() {
  var ss = SpreadsheetApp.openById('1fTL_w-kLz0Jzwni9r3kSuGqSvlsFhNm0RsfRurQH750');
  var sheet = ss.getSheetByName('Pour Takeoff');
  var last = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  var range = sheet.getRange(1, 1, last, lastCol);

  // Reset all formatting to clean baseline
  range.setBackground('#ffffff');
  range.setFontColor('#1a1a1a');
  range.setFontFamily('Inter');
  range.setFontSize(10);
  range.setBorder(false, false, false, false, false, false);
  range.setFontWeight('normal');

  var values = sheet.getDataRange().getValues();

  // Muted section colors (light pastels)
  var secBg = { 'A': '#e8f5e9', 'B': '#fff3e0', 'C': '#e3f2fd', 'D': '#ede7f6' };
  var secText = { 'A': '#2e7d32', 'B': '#e65100', 'C': '#1565c0', 'D': '#4527a0' };

  for (var i = 0; i < values.length; i++) {
    var row = i + 1;
    var cellA = String(values[i][0]).trim();
    var rowRange = sheet.getRange(row, 1, 1, lastCol);

    // Title row
    if (cellA.indexOf('CUP CONCRETE') > -1) {
      rowRange.setBackground('#1C2E54');
      rowRange.setFontColor('#ffffff');
      rowRange.setFontSize(12);
      rowRange.setFontWeight('bold');
      continue;
    }

    // Reference section (A, B, C, D single-letter rows)
    if (/^[A-D]$/.test(cellA) && i < 10) {
      var bg = secBg[cellA] || '#f5f5f5';
      var txt = secText[cellA] || '#333';
      rowRange.setBackground(bg);
      sheet.getRange(row, 1).setFontColor(txt).setFontWeight('bold');
      continue;
    }

    // TOTAL row
    if (cellA === 'TOTAL' || cellA === 'GRAND TOTAL') {
      rowRange.setBackground('#1C2E54');
      rowRange.setFontColor('#ffffff');
      rowRange.setFontWeight('bold');
      continue;
    }

    // Section headers (SECTION A — ...)
    if (cellA.indexOf('SECTION') === 0 && cellA.indexOf('TOTAL') === -1) {
      var sec = cellA.charAt(8);
      rowRange.setBackground(secBg[sec] || '#f5f5f5');
      rowRange.setFontColor(secText[sec] || '#333');
      rowRange.setFontWeight('bold');
      rowRange.setFontSize(10);
      continue;
    }

    // Column headers (Pour, Section, ...)
    if (cellA === 'Pour' || cellA === 'ORDER SUMMARY') {
      rowRange.setBackground('#f0f0f0');
      rowRange.setFontColor('#666666');
      rowRange.setFontWeight('bold');
      rowRange.setFontSize(9);
      continue;
    }

    // Section total rows
    if (String(values[i][3]).indexOf('SECTION') > -1 && String(values[i][3]).indexOf('TOTAL') > -1) {
      rowRange.setBackground('#f5f5f5');
      rowRange.setFontWeight('bold');
      rowRange.setFontColor('#333333');
      continue;
    }

    // Subtotal rows
    if (String(values[i][3]).indexOf('SUBTOTAL') > -1) {
      rowRange.setBackground('#fafafa');
      rowRange.setFontColor('#999999');
      rowRange.setFontSize(9);
      continue;
    }

    // Pour data rows
    if (/^[A-D]-[1-9]/.test(cellA)) {
      var sec = cellA.charAt(0);
      sheet.getRange(row, 1).setFontColor(secText[sec] || '#333').setFontWeight('bold');
      // Alternate row shading
      if (i % 2 === 0) rowRange.setBackground('#fafbfc');
      continue;
    }
  }

  // Auto-resize columns
  for (var c = 1; c <= lastCol; c++) {
    sheet.autoResizeColumn(c);
  }

  // Freeze first row
  sheet.setFrozenRows(1);

  SpreadsheetApp.flush();
}
