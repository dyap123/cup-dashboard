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

  if (data.action === 'updateEmbeds') {
    return handleUpdateEmbeds(ss, data);
  }

  if (data.action === 'checkEmbed') {
    return handleCheckEmbed(ss, data);
  }

  return ContentService.createTextOutput(JSON.stringify({ok:true}))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleFieldUpdate(sheet, data) {
  var pourId = data.pourId;
  var field = data.field;
  var value = data.value;
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
    if (!inOrderSummary && field === 'date' && cellA === pourId) {
      sheet.getRange(i + 1, 3).setValue(value);
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

// Embed tracker: update embed assignments for a footing
// Columns: Pour | Footing ID | Footing Type | Embed ID | Bolts | Plate (SP) | Qty | Verified | Verified By | Timestamp
function handleUpdateEmbeds(ss, data) {
  var tracker = ss.getSheetByName('Embed Tracker');
  if (!tracker) return ContentService.createTextOutput(JSON.stringify({error:'no Embed Tracker tab'})).setMimeType(ContentService.MimeType.JSON);

  var pourId = data.pourId;
  var footingId = data.footingId;
  var ftype = data.ftype || '';
  var embeds = data.embeds || [];

  // Embed reference data
  var embedRef = {
    '51A':{bolts:4,sp:'SP-13'}, '55A':{bolts:4,sp:'SP-14'}, '56A':{bolts:4,sp:'SP-15'},
    '60A':{bolts:4,sp:'SP-15'}, '65A':{bolts:4,sp:'SP-16'}, '70A':{bolts:6,sp:'SP-17'},
    '80A':{bolts:8,sp:'SP-18'}, '85A':{bolts:8,sp:'SP-19'}, '86A':{bolts:4,sp:'SP-20'},
    '90A':{bolts:30,sp:'SP-20'}
  };

  // Delete existing rows for this footing
  var values = tracker.getDataRange().getValues();
  for (var i = values.length - 1; i >= 1; i--) {
    if (String(values[i][0]).trim() === pourId && String(values[i][1]).trim() === footingId) {
      tracker.deleteRow(i + 1);
    }
  }

  // Write new rows
  embeds.forEach(function(e) {
    var ref = embedRef[e.embedId] || {};
    tracker.appendRow([
      pourId, footingId, ftype, e.embedId, ref.bolts || '', ref.sp || '', e.qty || 1, '', '', ''
    ]);
  });

  return ContentService.createTextOutput(JSON.stringify({ok:true}))
    .setMimeType(ContentService.MimeType.JSON);
}

// Embed tracker: mark an embed as verified/unverified
function handleCheckEmbed(ss, data) {
  var tracker = ss.getSheetByName('Embed Tracker');
  if (!tracker) return ContentService.createTextOutput(JSON.stringify({error:'no Embed Tracker tab'})).setMimeType(ContentService.MimeType.JSON);

  var pourId = data.pourId;
  var footingId = data.footingId;
  var embedId = data.embedId;
  var checked = data.checked;
  var timestamp = data.timestamp || new Date().toISOString();

  var values = tracker.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === pourId &&
        String(values[i][1]).trim() === footingId &&
        String(values[i][3]).trim() === embedId) {
      tracker.getRange(i + 1, 8).setValue(checked ? 'YES' : '');
      tracker.getRange(i + 1, 9).setValue(checked ? 'Inspector' : '');
      tracker.getRange(i + 1, 10).setValue(checked ? timestamp : '');
      return ContentService.createTextOutput(JSON.stringify({ok:true}))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  return ContentService.createTextOutput(JSON.stringify({ok:true, found:false}))
    .setMimeType(ContentService.MimeType.JSON);
}
