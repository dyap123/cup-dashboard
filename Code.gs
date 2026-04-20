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

  if (data.action === 'addPour') {
    return handleAddPour(sheet, data);
  }

  if (data.action === 'deletePour') {
    return handleDeletePour(sheet, data);
  }

  if (data.action === 'uploadTicket') {
    return handleUploadTicket(data);
  }

  if (data.action === 'bundleEOD') {
    return handleBundleEOD(data);
  }

  return ContentService.createTextOutput(JSON.stringify({ok:true}))
    .setMimeType(ContentService.MimeType.JSON);
}

// Insert a new pour row at the end of ORDER SUMMARY (before GRAND TOTAL).
// Sheet columns: A=id, B=section, C=date, D=cy8000, E=cy5000, F=slurry, G=total, H=trucks, I=ordered
function handleAddPour(sheet, data) {
  var values = sheet.getDataRange().getValues();
  var inOrderSummary = false;
  var grandTotalRow = -1;
  for (var i = 0; i < values.length; i++) {
    var cellA = String(values[i][0]).trim();
    if (cellA === 'ORDER SUMMARY') { inOrderSummary = true; continue; }
    if (!inOrderSummary) continue;
    if (cellA === 'GRAND TOTAL') { grandTotalRow = i + 1; break; }
    if (cellA === data.pourId) {
      return ContentService.createTextOutput(JSON.stringify({error:'pour already exists'}))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }
  if (grandTotalRow < 0) {
    return ContentService.createTextOutput(JSON.stringify({error:'no GRAND TOTAL anchor'}))
      .setMimeType(ContentService.MimeType.JSON);
  }
  sheet.insertRowBefore(grandTotalRow);
  var total = (Number(data.cy8000)||0) + (Number(data.cy5000)||0) + (Number(data.slurry)||0);
  var trucks = Math.ceil(total / 9);
  sheet.getRange(grandTotalRow, 1, 1, 8).setValues([[
    data.pourId,
    data.section || String(data.pourId).charAt(0),
    data.date || '',
    Number(data.cy8000) || 0,
    Number(data.cy5000) || 0,
    Number(data.slurry) || 0,
    total,
    trucks
  ]]);
  return ContentService.createTextOutput(JSON.stringify({ok:true, row:grandTotalRow}))
    .setMimeType(ContentService.MimeType.JSON);
}

// Delete a pour row from ORDER SUMMARY by pourId.
function handleDeletePour(sheet, data) {
  var values = sheet.getDataRange().getValues();
  var inOrderSummary = false;
  for (var i = 0; i < values.length; i++) {
    var cellA = String(values[i][0]).trim();
    if (cellA === 'ORDER SUMMARY') { inOrderSummary = true; continue; }
    if (!inOrderSummary) continue;
    if (cellA === 'GRAND TOTAL') break;
    if (cellA === data.pourId) {
      sheet.deleteRow(i + 1);
      return ContentService.createTextOutput(JSON.stringify({ok:true}))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }
  return ContentService.createTextOutput(JSON.stringify({ok:true, found:false}))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── TICKET PHOTO UPLOAD ────────────────────────────────────────────────────
// Expects { action:'uploadTicket', pourId, truckNum, ticket, mimeType, dataB64 }
// Photos land in Drive under TICKETS_ROOT_ID / {pourId} / truck-{num}-{ticket}.jpg
var TICKETS_ROOT_ID = 'REPLACE_WITH_DRIVE_FOLDER_ID';

function handleUploadTicket(data) {
  try {
    var rootFolder = DriveApp.getFolderById(TICKETS_ROOT_ID);
    var pourFolder = getOrCreateFolder(rootFolder, data.pourId);
    var bytes = Utilities.base64Decode(data.dataB64);
    var name = 'truck-' + (data.truckNum || 'x') + (data.ticket ? '-' + data.ticket : '') + '-' + Date.now() + '.jpg';
    var blob = Utilities.newBlob(bytes, data.mimeType || 'image/jpeg', name);
    var file = pourFolder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return ContentService.createTextOutput(JSON.stringify({
      ok: true,
      fileId: file.getId(),
      viewUrl: 'https://drive.google.com/uc?export=view&id=' + file.getId(),
      thumbnailUrl: 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w200'
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({error: String(err)}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getOrCreateFolder(parent, name) {
  var it = parent.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return parent.createFolder(name);
}

// ── END-OF-DAY REPORT BUNDLE ───────────────────────────────────────────────
// Expects { action:'bundleEOD', pourId, date, reportHtml }
// Creates a Google Doc alongside the existing ticket photos in the same pour folder.
function handleBundleEOD(data) {
  try {
    var rootFolder = DriveApp.getFolderById(TICKETS_ROOT_ID);
    var pourFolder = getOrCreateFolder(rootFolder, data.pourId);
    var docName = 'EOD ' + data.pourId + ' ' + (data.date || new Date().toISOString().slice(0,10));
    // Remove any prior doc of the same name so we don't duplicate on re-run
    var existing = pourFolder.getFilesByName(docName);
    while (existing.hasNext()) existing.next().setTrashed(true);
    var blob = Utilities.newBlob(data.reportHtml || '<html><body>Empty</body></html>', 'text/html', docName + '.html');
    var htmlFile = pourFolder.createFile(blob);
    htmlFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return ContentService.createTextOutput(JSON.stringify({
      ok: true,
      folderUrl: pourFolder.getUrl(),
      htmlUrl: 'https://drive.google.com/uc?export=view&id=' + htmlFile.getId()
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({error: String(err)}))
      .setMimeType(ContentService.MimeType.JSON);
  }
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
