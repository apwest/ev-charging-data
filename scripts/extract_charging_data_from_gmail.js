EV_SS = "1k_YdjVTuWUZXMTtPN7s57KS6wmW955t2UnIw_BDHae0"

//// Columns:
//  Date
//	Network
//	Station ID
//	Station Energy
//	Start Time
//	Finish Time
//	Duration
//	Energy (kWh)
//	Total (USD)
//	Miles
//	Avg. Cost (¢/mi)"

function updateEvChargingData() {
  var ss = SpreadsheetApp.openById(EV_SS);
  var sheet = ss.getActiveSheet();
  var threads;

  // Blink Charging Data
  threads = GmailApp.search("label:unread label:home-auto from:blinknetwork.com subject:\"charging session receipt\"");
  console.log("Found %d emails from 'Blink'", threads.length);
  extractChargingData(threads, extractBlinkChargingData, sheet);

  // Electrify America Charging Data
  threads = GmailApp.search("label:inbox label:home-auto subject:\"Your receipt from Ford\"");
  console.log("Found %d emails from 'Ford'", threads.length);
  extractChargingData(threads, extractElectrifyAmericaData, sheet);

  // (re)format columns
  sheet.getRange("A2:A").setNumberFormat("mm-dd-yyyy"); // Date
  sheet.getRange("H2:H").setNumberFormat("0.0000");     // Energy
  sheet.getRange("I2:I").setNumberFormat("$#,##0.00");  // Cost
  sheet.getRange("J2:J").setNumberFormat("0.0");        // Miles
  sheet.getRange("K2:K").setNumberFormat("0.0");        // Avg. Cost (¢/mi)
}

// Extractors return one entry per charging session found in the thread: the
// row to append, or null if that session couldn't be fully parsed. A thread is
// only archived once every session in it parsed, so a bad one is retried on the
// next run. Sessions already in the sheet (matched on Start Time, col E) are
// skipped, so that retry -- or a new receipt landing in an already-processed
// thread -- can't append the same session twice.
function extractChargingData(threads, extractor, sheet) {
  var seen = existingStartTimes(sheet);
  for (var i = 0; i < threads.length; i++) {
    var thread = threads[i];
    var rows = extractor(thread);
    var complete = rows.length > 0;
    for (var k = 0; k < rows.length; k++) {
      var data = rows[k];
      if (data == null) {
        complete = false;
        continue;
      }
      if (seen[data[4]]) {
        console.log("Already in sheet, skipping: %s", data);
        continue;
      }
      seen[data[4]] = true;
      sheet.appendRow(data);
      fillDownTripFormulas(sheet, sheet.getLastRow());
      console.log(data);
    }
    if (complete) {
      thread.markRead();
      thread.moveToArchive();
    }
  }
}

// Start Time (col E) of every row, as displayed -- the same string the
// extractors produce, e.g. "2026-05-29 7:32:44 AM EDT".
function existingStartTimes(sheet) {
  var seen = {};
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return seen;
  sheet.getRange(2, 5, lastRow - 1, 1).getDisplayValues().forEach(function (r) {
    seen[r[0]] = true;
  });
  return seen;
}

// Columns K:P hold per-row / per-trip formulas (Avg. Cost, marker, count,
// Energy/Trip, Mi/kWh/Trip, Month). Sheets does NOT extend these to rows added
// via appendRow(), which writes only up to Miles (J), so new rows arrive with
// K:P blank. Copy the formulas down from the nearest populated row above;
// relative references shift to the new row automatically (PASTE_FORMULA).
// convert.mjs no longer depends on these columns (it derives trip boundaries
// from the Miles column and computes cost/mile itself), but keeping them filled
// preserves the in-sheet views and the +/- marker.
var FORMULA_FIRST_COL = 11; // column K
var FORMULA_NUM_COLS = 6;   // K:P
var MARKER_COL = 12;        // column L, the +/- trip marker

function fillDownTripFormulas(sheet, row) {
  var srcRow = lastFormulaRow(sheet, row - 1);
  if (srcRow == null) return; // no formula row to copy from yet
  sheet.getRange(srcRow, FORMULA_FIRST_COL, 1, FORMULA_NUM_COLS).copyTo(
    sheet.getRange(row, FORMULA_FIRST_COL, 1, FORMULA_NUM_COLS),
    SpreadsheetApp.CopyPasteType.PASTE_FORMULA,
    false
  );
}

// Walk upward from fromRow to the last row whose marker cell (col L) actually
// holds a formula, so a run of blank rows (or a manual "?" override, which is a
// static value) can't make the fill-down copy nothing and cascade blanks.
function lastFormulaRow(sheet, fromRow) {
  for (var r = fromRow; r >= 2; r--) {
    if (sheet.getRange(r, MARKER_COL).getFormula() !== '') return r;
  }
  return null;
}

function extractBlinkChargingDataFromEmails() {
  // Get all of the unread emails with the label "foobar".
  var threads = GmailApp.search("label:inbox label:home-auto from:blinknetwork.com subject:\"charging session receipt\"");

  console.log("Found " + threads.length + " threads...");

  // Iterate over the threads and extract the data.
  for (var i = 0; i < threads.length; i++) {
    var thread = threads[i];

    var data = extractBlinkChargingData(thread);
    if (data != null) {
      sheet.appendRow(data);
      thread.markRead();
      thread.moveToArchive();
      console.log(data);
    }
  }

}

function extractElectrifyAmericaData(thread) {
    var messages = thread.getMessages();
    var cost = 0, miles = 0;
    var data = [];

    for (var j = 0; j < messages.length; j++) {
      var message = messages[j];
      var text = message.getPlainBody();

      /* (NEW FORMAT)
        Receipt 
        Vehicle Nickname: Mustang Mach-E
        Purchase Date: 01/07/2026
        
        Charge Event Address: 73 Burlington Mall Road, Burlington, Massachusetts, USA, 01803

        Seller: Electrify America
        
        Charge Event Start Time: 01/07/2026 7:28 AM EST
        
        Charge Event End Time: 01/07/2026 7:38 AM EST

        BlueOval&trade; Charge Network
        Sold To:
        Andrew
        West
        
        33 Dailey Ave , North Easton, MA, USA-02356

        Invoice Date: 01/07/2026
        
        Confirmation Number: USADM03024542

        Energy: 12.353 kWh
        Session fee&#42;: $0.00
        Tax: $0.00
        TOTAL: $0.00

        Total kWh Used: 12.353 kWh
        
        New Balance: 136.00 kWh
        */
      /* (OLD FORMAT)
        *RECEIPT*
        *Vehicle Nickname: *Mustang Mach-E
        *Date: *04/26/2024
        *Charge Event Address: *73 Burlington Mall Road, Burlington, Massachusetts, 
        USA, 01803

        *Operator: *Electrify America
        *Charge Event Start Time: *04/26/2024 7:35 AM EDT
        *Charge Event End Time: *04/26/2024 8:06 AM EDT

        *Merchant: *Ford - BEV Charging
        *Sold To: *
        Andrew West
        USA

        *Invoice Date: *04/26/2024
        *Confirmation Number: *USADM00919019

        *Energy: *50.394 kWh
        *Session fee*: *$0.00
        *Tax: *$0.00
        *TOTAL: **$0.00*

        *Total kWh Used: *50.394 kWh
        *New Balance: *200.00 kWh
      */
      if (j == 0) {
        // Date
        // *Date: *04/26/2024
        // regex = /\*Date: \*([0-9]{2})\/([0-9]{2})\/([0-9]{4})/
        // Purchase Date: 01/07/2026
        regex = /Date: ([0-9]{2})\/([0-9]{2})\/([0-9]{4})/
        match = regex.exec(text);
        if (match != null) {
            data.push(match[1] + "-" + match[2] + "-" + match[3]);
        }

        // Network
        // *Operator: *Electrify America
        // regex = /\*Operator: \*(.*)/
        // Seller: Electrify America
        regex = /Seller: (.*)/
        match = regex.exec(text);
        if (match != null) {
            data.push(match[1]);
        }

        // Station ID and Power
        // regex = //
        // match = regex.exec(text);
        // if (match != null) {
        //   data.push(match[1], match[2]);
        // }
        data.push("unknown", "unknown");

        var start_time, finish_time;

        // Start Time
        // *Charge Event Start Time: *04/26/2024 7:35 AM EDT
        // regex = /\*Charge Event Start Time: \*([0-9]{2}\/[0-9]{2}\/[0-9]{4} [0-9]+:[0-9]{2} (AM|PM) ...)/
        // Charge Event Start Time: 01/07/2026 7:28 AM EST
        regex = /Charge Event Start Time: ([0-9]{2}\/[0-9]{2}\/[0-9]{4} [0-9]+:[0-9]{2} (AM|PM) ...)/
        match = regex.exec(text);
        if (match != null) {
          data.push(Utilities.formatDate(new Date(match[1]), "America/New_York", "yyyy-MM-dd h:mm:ss a z"));
          start_time = new Date(match[1]);
        }

        // Finish Time
        // *Charge Event End Time: *04/26/2024 8:06 AM EDT
        // regex = /\*Charge Event End Time: \*([0-9]{2}\/[0-9]{2}\/[0-9]{4} [0-9]+:[0-9]{2} (AM|PM) ...)/
        // Charge Event End Time: 01/07/2026 7:38 AM EST
        regex = /Charge Event End Time: ([0-9]{2}\/[0-9]{2}\/[0-9]{4} [0-9]+:[0-9]{2} (AM|PM) ...)/
        match = regex.exec(text);
        if (match != null) {
          data.push(Utilities.formatDate(new Date(match[1]), "America/New_York", "yyyy-MM-dd h:mm:ss a z"));
          finish_time = new Date(match[1]);
        }

        // Duration
        var hours, minutes, seconds;
        [hours, minutes, seconds] = getDuration(start_time, finish_time);
        var duration = Utilities.formatString('%02d:%02d:%02d', hours, minutes, seconds);
        data.push(duration);

        // Energy (kWh)
        // *Energy: *50.394 kWh
        // regex = /\*Energy: \*([0-9]+.[0-9]+) kWh/
        // Energy: 12.353 kWh
        regex = /Energy: ([0-9]+.[0-9]+) kWh/
        match = regex.exec(text);
        if (match != null) {
          data.push(match[1]);
        }

        // Total (USD)
        // *TOTAL: **$0.00*
        // regex = /\*TOTAL: \*\*\$([0-9]+.[0-9]{2})\*/
        // TOTAL: $0.00
        regex = /TOTAL: \$([0-9]+.[0-9]{2})/
        match = regex.exec(text);
        if (match != null) {
          data.push(match[1]);
          cost = match[1];
        }
      }
    }

    if (data.length == 9) {
      data.push(miles);
      avg_cost_per_mile = 0;
      data.push(avg_cost_per_mile);
    } else
    if (data.length == 10) {
      avg_cost_per_mile = 100.0 * parseFloat(cost) / parseFloat(miles);
      data.push(avg_cost_per_mile);
    }
    console.log(data);
    if (data.length == 11) {
      return [data];
    }
    return [null];
}

function getDuration(start_time, end_time) {
  var dt = end_time.valueOf() - start_time.valueOf();
  var sec=1000;
  var min=60*sec;
  var hour=60*min;
  var hours=Math.floor(dt/hour);
  var minutes=Math.floor(dt%hour/min);
  var seconds=Math.floor(dt%hour%min/sec);
  return [hours, minutes, seconds];
}

// Marks where a forwarded copy starts (Gmail web/app, Apple Mail). Anything
// above it is the note I typed (the miles); anything below is the original
// receipt quoted back.
var FORWARD_MARKER = /-+ ?Forwarded message ?-+|Begin forwarded message:/;

function extractBlinkChargingData(thread) {
  /* A thread can hold several sessions: Gmail groups same-day receipts (same
  subject) into one thread, along with the receipts I forward to myself with
  the miles typed above the forwarded body. So instead of relying on message
  order, key every message by the receipt number it contains, take the
  receipt fields from the first copy that parses, and take the miles only
  from my note above the forward marker (never from the quoted receipt). */
  var messages = thread.getMessages();
  var sessions = {};  // receipt number -> { row, miles }
  var order = [];     // receipt numbers, in the order first seen

  for (var j = 0; j < messages.length; j++) {
    var text = messages[j].getPlainBody();
    var fwd = FORWARD_MARKER.exec(text);
    var note = fwd ? text.slice(0, fwd.index) : "";
    var body = fwd ? text.slice(fwd.index) : text;
    var match;

    match = /Receipt Number\s+(CP-[0-9]+)/.exec(body);
    if (match == null) {
      console.log("Blink message %d has no receipt number, ignoring", j);
      continue;
    }
    var id = match[1];
    if (!(id in sessions)) {
      sessions[id] = { row: null, miles: 0 };
      order.push(id);
    }
    var session = sessions[id];

    if (session.row == null) {
      session.row = parseBlinkReceipt(body);
    }

    // Miles: "45 miles", "145 miles", "45.3 miles"
    match = /([0-9]+(?:\.[0-9]+)?) [Mm]iles/.exec(note);
    if (match != null) {
      session.miles = match[1];
    }
  }

  return order.map(function (id) {
    var session = sessions[id];
    if (session.row == null) {
      console.log("Skipping Blink receipt %s, receipt fields missing", id);
      return null;
    }
    // Miles (0 if not forwarded yet). Avg. Cost (¢/mi) is left to the sheet.
    return session.row.concat([session.miles]);
  });
}

// Parse the receipt fields (Date..Total, columns A-I) from a Blink receipt.
// Returns null unless every field matched, so a missing one can't shift the
// remaining values into the wrong columns.
function parseBlinkReceipt(text) {
  var data = [];
  var regex;
  var match;

  /*
    Your charging session
    ---------------------

    Receipt Date
    ------------

    09-01-2026

    Energy Delivered
    ----------------

    17.4464 kWh

    Refund
    ------

    $0.00

    Net Total
    ---------

    $3.98 
    ...
    Detailed Charging Summary
    -------------------------

    Receipt Number CP-202601108039941 Charging Station BAE800232, 16.64 kW AC C=
    harging Station Location Bedford Campus Charging Station Address 202 Burlin=
    gton Rd, , Bedford, Massachusetts, United States, 1730 Transaction Start Ti=
    me 2026-01-09 7:17:12 AM EST Transaction Finish Time 2026-01-09 9:08:40 AM =
    EST Charging Duration 01:51:26 Transaction Started From PASS Transaction St=
    op Reason EVDisconnected Sales Tax(VAT):  Start Fee $0.49 Total *Inclusive =
    of all taxes/VAT $3.98
  */
  /*
    Receipt Number CP-202403101058886 Charging Station BAE800231, 16.64 kW AC C=
    harging Station Location Bedford Campus Charging Station Address 202 Burlin=
    gton Rd, , Bedford, Massachusetts, United States, 1730 Transaction Start Ti=
    me 2024-03-07 7:37:16 AM EST Transaction Finish Time 2024-03-07 11:16:17 AM=
    EST Charging Duration 03:02:11 Transaction Started From PASS Transaction S=
    top Reason EVDisconnected Energy Amount   $ Parking
    Amount   $ Sales Tax(VAT):  Service $0.00 Total *Inclusive of all taxes/VAT=
    $5.79
  */

  // Date: given as DD-MM-YYYY (Sheets wants MM-DD-YYYY)
  regex = /Receipt Date\r\n------------\r\n\r\n([0-9]{2})-([0-9]{2})-([0-9]{4})/
  match = regex.exec(text);
  if (match != null) {
      data.push(match[2] + "-" + match[1] + "-" + match[3])
  }

  // Network
  data.push("Blink");

  // Station ID and Power
  regex = /Charging Station ([0-9A-Z]+), (.+) Charging Station Location/
  match = regex.exec(text);
  if (match != null) {
    data.push(match[1], match[2]);
  }

  // Start Time
  regex = /Transaction Start Time ([0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]+:[0-9]{2}:[0-9]{2} (AM|PM) ...)/
  match = regex.exec(text);
  if (match != null) {
    data.push(match[1]);
  }

  // Finish Time
  regex = /Transaction Finish Time ([0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]+:[0-9]{2}:[0-9]{2} (AM|PM) ...)/
  match = regex.exec(text);
  if (match != null) {
    data.push(match[1]);
  }

  // Duration
  regex = /Charging Duration (.+) Transaction Started From/
  match = regex.exec(text);
  if (match != null) {
    data.push(match[1]);
  }

  // Energy (kWh)
  regex = /Energy Delivered\r\n----------------\r\n\r\n([0-9]+.[0-9]+) kWh/
  match = regex.exec(text);
  if (match != null) {
    data.push(match[1]);
  }

  // Total (USD)
  regex = /Net Total\r\n---------\r\n\r\n\$([0-9]+.[0-9]+)/
  match = regex.exec(text);
  if (match != null) {
    data.push(match[1]);
  }
  
  /*
    var regexes = [
      /Receipt Date\r\n------------\r\n\r\n([0-9]{2})-([0-9]{2})-([0-9]{4})/,
      /Charging Station ([0-9A-Z]+), (.+) Charging Station Location/,
      /Transaction Start Time ([0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]+:[0-9]{2}:[0-9]{2} (AM|PM) ...)/,
      /Transaction Finish Time ([0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]+:[0-9]{2}:[0-9]{2} (AM|PM) ...)/,
      /Charging Duration (.+) Transaction Started From/,
      /Energy Delivered\r\n----------------\r\n\r\n([0-9]+.[0-9]+) kWh/,
      /Net Total\r\n---------\r\n\r\n\$([0-9]+.[0-9]+)/
    ];
    regexes.forEach((regex, n) => {
      var match = regex.exec(text);
      if (match != null) {
        if (n == 0) {
          // Receipt Date: given as DD-MM-YYYY (sheet wants MM-DD-YYYY)
          data.push(match[2] + "-" + match[1] + "-" + match[3])
        } else if (n == 1) {
          // Charging Station: id, power
          data.push(match[1]);
          data.push(match[2]);
        } else {
          data.push(match[1]);
        }
        if (n == 6) {
          cost = match[1];
        }
      }
    })
  */

  if (data.length != 9) {
    return null;
  }
  return data;
}

function extractChargePointChargingDataFromEmails() {
  threads = GmailApp.search("label:unread label:home-auto from:ChargePoint subject:\"Charging Complete\"");
  console.log("Found %d emails from 'Charge Point'", threads.length);

  // Iterate over the threads and extract the data.
  for (var i = 0; i < threads.length; i++) {
    var thread = threads[i];

    var data = extractChargePointChargingData(thread);
    // if (data != null) {
    //   sheet.appendRow(data);
    //   thread.markRead();
    //   thread.moveToArchive();
    //   console.log(data);
    // }
  }
}

function extractChargePointChargingData(thread) {
  var messages = thread.getMessages();
  var cost = 0, miles = 0;
  var data = [];

  for (var j = 0; j < messages.length; j++) {
    /* The first message in the thread will be the original receipt from
    Blink for the charging session. The second message will be a message
    from/to me with the total miles traveled on that trip. */

    var message = messages[j];
    var text = message.getPlainBody();
    // console.log(text);

    // Dear Andrew, We wanted to let you know that your vehicle, which is charging
    // at BEA STATION / CENTRAL ADMIN, is drawing very little power. Typically,
    // this means it’s fully charged, however, it may also indicate that your
    // vehicle is configured for delayed charging. Your vehicle has accepted 49.23
    // kWh of electricity and has been plugged in for 08:20:03 (hh:mm:ss).
    if (j == 0) {
      // Date
      date = message.getDate();
      data.push(Utilities.formatDate(date, "America/New_York", "MM-dd-yyyy"));

      // Network
      data.push("Charge Point");

      // Station ID and Power
      // regex = //
      // match = regex.exec(text);
      // if (match != null) {
      //   data.push(match[1], match[2]);
      // }
      data.push("unknown", "unknown");

      // var start_time, finish_time;

      // Start Time
      data.push("unknown");
      // regex = /\*Charge Event Start Time: \*([0-9]{2}\/[0-9]{2}\/[0-9]{4} [0-9]+:[0-9]{2} (AM|PM) ...)/
      // match = regex.exec(text);
      // if (match != null) {
      //   data.push(Utilities.formatDate(new Date(match[1]), "America/New_York", "yyyy-MM-dd h:mm:ss a z"));
      //   start_time = new Date(match[1]);
      // }

      // Finish Time
      data.push("unknown");
      // regex = /\*Charge Event End Time: \*([0-9]{2}\/[0-9]{2}\/[0-9]{4} [0-9]+:[0-9]{2} (AM|PM) ...)/
      // match = regex.exec(text);
      // if (match != null) {
      //   data.push(Utilities.formatDate(new Date(match[1]), "America/New_York", "yyyy-MM-dd h:mm:ss a z"));
      //   finish_time = new Date(match[1]);
      // }

      // Duration
      // plugged in for 08:20:03 (hh:mm:ss)
      regex = /plugged in for ([0-9]{2}:[0-9]{2}:[0-9]{2}) \(hh:mm:ss\)/
      match = regex.exec(text);
      if (match != null) {
        data.push(match[1]);
      }

      // Energy (kWh)
      // Your vehicle has accepted 49.23 kWh of electricity
      regex = /accepted ([0-9]+.[0-9]+) kWh of electricity/
      match = regex.exec(text);
      if (match != null) {
        data.push(match[1]);
      }

      // Total (USD)
      cost = 0.0;
      data.push(cost);
    }

    else if (j == 1) {
      // Miles
      regex = /([0-9]+.[0-9]+) [Mm]iles/
      match = regex.exec(text);
      if (match != null) {
        data.push(match[1]);
        miles = match[1];
      }
    }
  }

  console.log(data);

}