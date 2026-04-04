function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  var ss = SpreadsheetApp.openById('1fTL_w-kLz0Jzwni9r3kSuGqSvlsFhNm0RsfRurQH750');
  var sheet = ss.getSheetByName('CUP Pours');

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
  var fieldToCol = { date: 3, cy8000: 4, cy5000: 5, slurry: 6 };
  var col = fieldToCol[field];

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
    if (!inOrderSummary) continue;
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
