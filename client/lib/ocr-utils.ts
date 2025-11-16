import heic2any from "heic2any";

export interface ExtractedInvoiceData {
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerAddress?: string;
  dateReceived?: string;
  date?: string;
  invoiceNumber?: string;
  isOldRepairFormat?: boolean;
  instruments?: Array<{ type: string; description: string }>;
  repairDescription?: string;
  materials?: Array<{
    description: string;
    quantity: number;
    unitCost: number;
  }>;
  laborHours?: number;
  hourlyRate?: number;
  workDone?: string;
  isGeorgesMusic?: boolean;
  isNoDeliveryFee?: boolean;
  debugLog?: string[];
}

const readFileAsDataURL = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Failed to read file as data URL"));
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};


// Convert HEIC/HEIF images to JPEG
const convertHeicToJpeg = async (file: File): Promise<File> => {
  if (!file.type.includes("heic") && !file.type.includes("heif")) {
    return file;
  }

  try {
    const blob = (await heic2any({ blob: file })) as Blob;
    return new File([blob], file.name.replace(/\.heic$/i, ".jpg"), {
      type: "image/jpeg",
    });
  } catch (error) {
    try {
      console.error("HEIC conversion failed:", error);
    } catch (e) {
      console.error("HEIC conversion failed (unable to stringify error)");
    }
    // Some environments can't convert HEIC reliably client-side. Fall back to returning the original file
    // so OCR can attempt to process it. Warn the user in console and continue.
    console.warn(
      "Proceeding without HEIC->JPEG conversion; OCR may fail for HEIC images.",
    );
    return file;
  }
};

// Helper to find customer address (not store address)
// Now receives the customerSection text already isolated
const extractAddressFromText = (
  customerSectionText: string,
): string | undefined => {
  const lines = customerSectionText.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Skip obvious store lines
    if (/Woodland|1025\s+E|George's\s+Music|Springfield/i.test(trimmed)) {
      continue;
    }

    // Match street address: number + street name/type + optional apt
    if (
      /^\d{1,5}\s+[\w\s&,.'-]+(?:Lane|Ln|Street|St|Ave|Avenue|Road|Rd|Drive|Dr|Way|Blvd|Boulevard|Court|Ct|Place|Pl|Terrace|Terr)*/i.test(
        trimmed,
      )
    ) {
      const addressParts: string[] = [trimmed];
      let nextIdx = i + 1;

      let cityFound = false;
      let stateZipFound = false;

      while (nextIdx < lines.length && addressParts.length < 4) {
        const nextLine = lines[nextIdx].trim();
        if (!nextLine) {
          nextIdx++;
          continue;
        }

        if (
          /Phone|Email|Signature|Primary|Second|Follow|Picked|Technician/i.test(
            nextLine,
          )
        ) {
          break;
        }

        if (
          !cityFound &&
          /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?(?:\s+[A-Z][a-z]+)?$/.test(
            nextLine,
          ) &&
          !/PA|Pennsylvania|State|Zip/i.test(nextLine)
        ) {
          addressParts.push(nextLine);
          cityFound = true;
          nextIdx++;
          continue;
        }

        if (
          !stateZipFound &&
          (/\bPA\b|\bPennsylvania\b/i.test(nextLine) || /\d{5}/.test(nextLine))
        ) {
          const cleanLine = nextLine.replace(/Pc(?!\w)/gi, "").trim();
          const stateMatch = cleanLine.match(/\bPA\b/i);
          const zipMatch = cleanLine.match(/\b(\d{5})\b/);

          if (stateMatch || zipMatch) {
            const stateStr = stateMatch ? "PA" : "";
            const zipStr = zipMatch ? zipMatch[1] : "";
            const stateZipStr = [stateStr, zipStr].filter(Boolean).join(" ");
            if (stateZipStr) addressParts.push(stateZipStr);
            stateZipFound = true;
          }
          nextIdx++;
          continue;
        }

        if (
          /Phone|Email|Signature|Primary|Second|Follow|Picked|Technician|[A-Z]{2,}\s*(?:\d{5})?$/.test(
            nextLine,
          ) &&
          stateZipFound
        ) {
          break;
        }

        if (addressParts.length >= 2) break;
        nextIdx++;
      }

      let fullAddress = addressParts.join(", ");
      fullAddress = fullAddress
        .replace(/\bPc\b/g, "")
        .replace(/,\s*,/g, ",")
        .trim();

      if (addressParts.length >= 2) return fullAddress;
    }
  }

  return undefined;
};

// Helper to find invoice number
const extractInvoiceNumber = (text: string): string | undefined => {
  // Pattern 1: "Invoice Number: XXXXX" format (old repair form)
  const numberLabelMatch = text.match(/Invoice\s+Number\s*:\s*(\d+)/i);
  if (numberLabelMatch) {
    return numberLabelMatch[1];
  }

  // Pattern 2: "Invoice #XXXXX" or "Invoice# XXXXX" format
  const hashMatch = text.match(/Invoice\s*#\s*([A-Z0-9-]+)/i);
  if (hashMatch && !hashMatch[1].match(/^\d{5}$/)) {
    return hashMatch[1];
  }

  return undefined;
};

// Helper to validate address is in Delco or Montco PA
const isValidPAAddress = (address: string | undefined): boolean => {
  if (!address) return false;

  // Check if address contains PA or Pennsylvania
  if (!/(PA|Pennsylvania)/i.test(address)) return false;

  // List of common Delco and Montco municipalities and areas
  const delcoMontcoAreas = [
    // Delco County
    "chester",
    "darby",
    "ridley park",
    "swarthmore",
    "media",
    "broomall",
    "newtown square",
    "devon",
    "paoli",
    "rose valley",
    "upland",
    "haverford",
    "villanova",
    "radnor",
    "wayne",
    "norriton",
    "marple",
    "chadds ford",
    "kennett",
    "yorktown",
    "concord",
    "easttown",
    "london",
    "penn",
    "tredyffrin",
    "honey brook",
    "coatesville",
    "downingtown",
    // Montco County
    "lansdale",
    "hatboro",
    "horsham",
    "warrington",
    "doylestown",
    "newtown",
    "morrisville",
    "bristol",
    "bensalem",
    "colmar",
    "penndel",
    "jamison",
    "warminster",
    "souderton",
    "perkasie",
    "ambler",
    "fort washington",
    "willow grove",
    "whitemarsh",
    "dresher",
    "abington",
    "norriton",
    "franconia",
    "schwenksville",
    "pennsburg",
    "trappe",
    "skippack",
    "yerkes",
    "valley forge",
    "great valley",
  ];

  const addressLower = address.toLowerCase();
  return delcoMontcoAreas.some((area) => addressLower.includes(area));
};

// Helper to detect if document is old repair format
const isOldRepairFormat = (text: string): boolean => {
  // Old repair format has "Invoice Number:" label and table with Description/Quantity/Price columns
  const hasInvoiceNumberLabel = /Invoice\s+Number\s*:/i.test(text);
  const hasTableHeader = /Description|Quantity|Unit\s+Price|Cost/i.test(text);
  const hasServiceLabel = /Service\s*:/i.test(text);

  return hasInvoiceNumberLabel && (hasTableHeader || hasServiceLabel);
};

export const extractInvoiceData = async (
  imageFile: File,
): Promise<ExtractedInvoiceData> => {
  try {
    let processFile = imageFile;
    if (imageFile.type.includes("heic") || imageFile.type.includes("heif")) {
      console.log("Converting HEIC/HEIF to JPEG...");
      processFile = await convertHeicToJpeg(imageFile);
      console.log("HEIC conversion successful");
    }

    const dataUrl = await readFileAsDataURL(processFile);

    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve();
      img.onerror = (e) => {
        console.error(
          "Image load failed. File size:",
          processFile.size,
          "Type:",
          processFile.type,
        );
        reject(
          new Error(
            "Image failed to load - file may be corrupted or invalid format",
          ),
        );
      };
      img.src = dataUrl;
    });

    const normalizedDataUrl = await new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";

      const timeout = setTimeout(() => {
        reject(new Error("Image processing timeout"));
      }, 10000);

      img.onload = () => {
        clearTimeout(timeout);
        try {
          const maxW = 2000;
          let w = img.width;
          let h = img.height;
          if (w > maxW) {
            const ratio = maxW / w;
            w = maxW;
            h = Math.round(h * ratio);
          }
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Failed to get canvas context"));
            return;
          }
          ctx.fillStyle = "white";
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/png"));
        } catch (err) {
          reject(
            new Error(
              "Failed to process image canvas: " + (err as Error).message,
            ),
          );
        }
      };

      img.onerror = () => {
        clearTimeout(timeout);
        reject(new Error("Failed to load image for processing"));
      };

      img.src = dataUrl;
    });

    let ocrResult;
    try {
      console.log("Starting OCR with image size:", imageFile.size, "bytes");

      const logProgress = (m: any) => {
        if (m && m.status === "recognizing") {
          try {
            console.log(
              "OCR progress:",
              Math.round((m.progress || 0) * 100) + "%",
            );
          } catch (e) {
            // ignore
          }
        }
      };

      // Try to use global Tesseract first (CDN). If not available, use the npm package.
      const globalT =
        typeof window !== "undefined" ? (window as any).Tesseract : undefined;
      if (globalT && typeof globalT.recognize === "function") {
        console.log("Using global Tesseract");
        ocrResult = await globalT.recognize(normalizedDataUrl, "eng", {
          logger: logProgress,
        });
      } else {
        console.log("Using tesseract.js npm package");
        try {
          const Tesseract = await import("tesseract.js");
          // Call recognize directly on the default export
          ocrResult = await Tesseract.default.recognize(
            normalizedDataUrl,
            "eng",
            { logger: logProgress },
          );
        } catch (workerErr) {
          console.warn(
            "Worker-based OCR failed, trying alternative:",
            workerErr,
          );
          // Fallback: try the named export
          const { recognize } = await import("tesseract.js");
          ocrResult = await recognize(normalizedDataUrl, "eng", {
            logger: logProgress,
          });
        }
      }

      console.log("OCR completed successfully");
    } catch (err) {
      console.error("Tesseract failed:", err);
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error("OCR processing failed: " + msg);
    }

    const text =
      ocrResult && (ocrResult.data?.text || (ocrResult as any).text)
        ? ocrResult.data?.text || (ocrResult as any).text || ""
        : "";
    const extracted: ExtractedInvoiceData = {};
    const debugLog: string[] = [];

    const addLog = (msg: string) => {
      debugLog.push(msg);
      console.log(`[OCR] ${msg}`);
    };

    const lines = text.split("\n");
    addLog(`Total lines extracted: ${lines.length}`);
    addLog(`Full text length: ${text.length} characters`);

    // Detect format (old repair vs George's Music)
    const isOldFormat = isOldRepairFormat(text);
    extracted.isOldRepairFormat = isOldFormat;

    // Detect if this is a George's Music form by presence of header, "George's Total", or known address
    const isGeorges =
      /George'?s\s+Music/i.test(text) ||
      /Georges\s+Music/i.test(text) ||
      /George'?s\s+Total/i.test(text) ||
      (/Springfield\s*,?\s*PA/i.test(text) && /Georges?\s*Music/i.test(text));
    if (isGeorges) {
      extracted.isGeorgesMusic = true;
      addLog("Detected George's Music format");
    } else {
      extracted.isGeorgesMusic = false;
    }

    // Find key markers
    let troubleReportedIdx = -1;
    let customerInfoIdx = -1;
    let itemDescIdx = -1;

    for (let i = 0; i < lines.length; i++) {
      if (/Trouble\s+Reported/i.test(lines[i])) troubleReportedIdx = i;
      if (
        /CUSTOMER\s+INFORMATION/i.test(lines[i]) ||
        /CUSTOMER\s*INFORMATION/i.test(lines[i])
      )
        customerInfoIdx = i;
      if (/Item\s+Description/i.test(lines[i])) itemDescIdx = i;
    }

    // Fallback: search for markers with more lenient patterns
    if (troubleReportedIdx === -1) {
      for (let i = 0; i < lines.length; i++) {
        if (
          /Trouble|trouble/i.test(lines[i]) &&
          /Reported|reported/i.test(lines[i])
        ) {
          troubleReportedIdx = i;
          break;
        }
      }
    }
    if (customerInfoIdx === -1) {
      for (let i = 0; i < lines.length; i++) {
        if (
          /CUSTOMER|customer/i.test(lines[i]) &&
          /INFORMATION|information/i.test(lines[i])
        ) {
          customerInfoIdx = i;
          break;
        }
      }
    }

    const topSection =
      troubleReportedIdx > 0
        ? lines.slice(0, troubleReportedIdx).join("\n")
        : text.substring(
            0,
            text.indexOf("Trouble") > 0 ? text.indexOf("Trouble") : text.length,
          );
    const troubleSection =
      troubleReportedIdx > 0
        ? lines
            .slice(
              troubleReportedIdx,
              customerInfoIdx > troubleReportedIdx
                ? customerInfoIdx
                : lines.length,
            )
            .join("\n")
        : "";
    const customerSection =
      customerInfoIdx > 0 ? lines.slice(customerInfoIdx).join("\n") : text;

    // Invoice Number
    const invoiceNum = extractInvoiceNumber(text);
    if (invoiceNum) extracted.invoiceNumber = invoiceNum;

    // DATE - try direct "Date:" label first, then fall back to generic extraction
    let dateReceived: string | undefined;

    // Pattern 1: "Date: MM/DD/YY" format
    const dateLabelMatch = text.match(
      /Date\s*:\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/i,
    );
    if (dateLabelMatch) {
      const month = dateLabelMatch[1].padStart(2, "0");
      const day = dateLabelMatch[2].padStart(2, "0");
      const year =
        dateLabelMatch[3].length === 2
          ? "20" + dateLabelMatch[3]
          : dateLabelMatch[3];
      dateReceived = `${year}-${month}-${day}`;
    }

    // Pattern 2: date near "Service Location" label (George's Music format)
    if (!dateReceived) {
      const svcLineIndex = lines.findIndex((l) =>
        /Service\s+Location/i.test(l),
      );
      if (svcLineIndex > -1) {
        // search the same line and up to 5 lines above for a date, nearest first
        for (let offset = 0; offset <= 5; offset++) {
          const idx = svcLineIndex - offset;
          if (idx < 0) break;
          const line = lines[idx];
          const m = line.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
          if (m) {
            const month = m[1].padStart(2, "0");
            const day = m[2].padStart(2, "0");
            const year = m[3].length === 2 ? "20" + m[3] : m[3];
            dateReceived = `${year}-${month}-${day}`;
            break;
          }
        }
      }
    }

    // Pattern 3: find earliest date in the top section (above Trouble Reported)
    if (!dateReceived) {
      const topLines = topSection.split("\n");
      for (let i = 0; i < topLines.length; i++) {
        const m = topLines[i].match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
        if (m) {
          const month = m[1].padStart(2, "0");
          const day = m[2].padStart(2, "0");
          const year = m[3].length === 2 ? "20" + m[3] : m[3];
          dateReceived = `${year}-${month}-${day}`;
          break;
        }
      }
    }

    if (dateReceived) {
      extracted.dateReceived = dateReceived;
      extracted.date = dateReceived;
    }

    // CUSTOMER NAME - robust extraction from CUSTOMER INFORMATION
    let customerName: string | undefined;

    // Pattern 1: 'Attention:' label (works for both formats)
    const attentionMatch = text.match(/Attention\s*:\s*([^\n\r]+?)(?:\n|$)/i);
    if (attentionMatch) {
      customerName = attentionMatch[1]
        .trim()
        .replace(/[|\\]+/g, "")
        .trim();
    }

    // Pattern 2: look after CUSTOMER INFORMATION marker and pick first plausible name line
    if (!customerName && customerInfoIdx > -1) {
      addLog(`Found CUSTOMER INFORMATION at line ${customerInfoIdx}`);
      const afterMarkerLines = lines.slice(
        customerInfoIdx + 1,
        customerInfoIdx + 8,
      );
      addLog(
        `Checking next ${afterMarkerLines.length} lines for customer name`,
      );

      const isLikelyName = (s: string) => {
        if (!s) return false;
        // reject lines with obvious OCR artifacts or UI elements
        if (/Signature|Picked|Customer|Follow|Completed|Third/.test(s)) {
          addLog(`  Line "${s}" contains UI element keywords, skipping`);
          return false;
        }
        // remove stray punctuation
        const clean = s.replace(/[^A-Za-z\s'\-]/g, "").trim();
        if (!clean) return false;
        const parts = clean.split(/\s+/).filter(Boolean);

        // Filter out very short parts that are likely OCR artifacts (single letters at start/end)
        const meaningfulParts = parts.filter((p) => {
          const cleanPart = p.replace(/[\-' ]/g, "");
          return cleanPart.length >= 2;
        });

        if (meaningfulParts.length < 2) {
          addLog(
            `  Line "${s}" has only ${meaningfulParts.length} meaningful parts, skipping`,
          );
          return false;
        }
        // avoid lines that are all uppercase codes or contain digits
        if (/\d/.test(s)) {
          addLog(`  Line "${s}" contains digits, skipping`);
          return false;
        }
        if (/^[A-Z0-9]{3,}$/.test(s.replace(/\s+/g, ""))) {
          addLog(`  Line "${s}" is all uppercase code, skipping`);
          return false;
        }
        addLog(`  Line "${s}" looks like a name!`);
        return true;
      };

      for (const l of afterMarkerLines) {
        const t = l.trim();
        if (!t) continue;
        // Some OCR outputs include lines like 'SF8855' above name — skip those that include digits or are short
        if (isLikelyName(t)) {
          customerName = t.replace(/[|\[\]]+/g, "").trim();
          addLog(`Selected customer name from marker: "${customerName}"`);
          break;
        }
      }
    }

    // Fallback: try to find a likely name near the bottom of the page (before Phone/Email labels)
    if (!customerName) {
      // search for lines that look like names in customer section or nearby areas
      const searchLines =
        customerInfoIdx > 0
          ? lines.slice(
              Math.max(0, customerInfoIdx),
              Math.min(customerInfoIdx + 15, lines.length),
            )
          : lines.slice(Math.max(0, lines.length - 12));

      for (const l of searchLines) {
        const t = l.trim();
        if (!t) continue;
        // Reject obvious UI element lines
        if (
          /Signature|Picked|Customer|Follow|Completed|Third|rE|———|Email|Phone|Primary|Second/.test(
            t,
          )
        ) {
          addLog(`Fallback: Skipping UI element line: "${t}"`);
          continue;
        }
        // Check if line has meaningful name-like pattern (at least 2 words, all alphabetic)
        const parts = t.split(/\s+/).filter(Boolean);
        const meaningfulParts = parts.filter(
          (p) => p.length >= 2 && /^[A-Za-z'\-]+$/.test(p),
        );
        if (
          t.length > 4 &&
          /^[A-Za-z\s'\-]+$/.test(t) &&
          meaningfulParts.length >= 2
        ) {
          customerName = meaningfulParts
            .join(" ")
            .replace(/[|\[\]]+/g, "")
            .trim();
          addLog(`Fallback: Selected name from search: "${customerName}"`);
          break;
        }
      }
    }

    if (customerName) {
      // Clean customerName from OCR artifacts like 'pw', 'p/w', or '(w)', and trailing ': a'
      let cleanName = customerName
        .replace(/\(w\)/gi, "")
        .replace(/\b(?:pw|p\/w)\b[:.,]*/gi, "")
        .replace(/[|\[\]]+/g, "")
        .replace(/\s*:\s*[a-z]\s*$/gi, "") // Remove trailing ": a" or similar artifacts
        .replace(/\s*:\s*$/g, "") // Remove trailing colons
        .replace(/\s+/g, " ")
        .trim();
      if (cleanName) extracted.customerName = cleanName;
    }

    // EMAIL - find all emails and prefer non-store ones
    let selectedEmail: string | undefined;
    const allEmails = Array.from(
      text.matchAll(
        /([a-zA-Z0-9][a-zA-Z0-9._%+\-]*@[a-zA-Z0-9][a-zA-Z0-9.\-]*\.[a-zA-Z]{2,})/gi,
      ),
    );

    addLog(
      `Found ${allEmails.length} email(s) in OCR text: ${allEmails.map((m) => m[1]).join(", ")}`,
    );

    if (allEmails.length > 0) {
      for (const m of allEmails) {
        const email = m[1];
        if (
          email.toLowerCase().includes("springfield") ||
          email.toLowerCase().includes("george") ||
          email.toLowerCase().includes("georges")
        ) {
          addLog(`Skipping store email: ${email}`);
          continue;
        }
        selectedEmail = email;
        addLog(`Selected customer email: ${email}`);
        break;
      }
      if (!selectedEmail) {
        selectedEmail = allEmails[0][1];
        addLog(`Using first email (all were filtered): ${selectedEmail}`);
      }
    } else {
      addLog(`No emails found in OCR text`);
    }

    if (selectedEmail) {
      extracted.customerEmail = selectedEmail.trim();
      addLog(`Email extracted: ${extracted.customerEmail}`);
    }

    // PHONE - look specifically for Number: or Phone: labels
    let phone: string | undefined;

    // Pattern 1: "Number: XXXXXXXXXX" format
    const numberLabelMatch = text.match(/Number\s*:\s*(\d{7,})/i);
    if (numberLabelMatch) phone = numberLabelMatch[1];

    // Pattern 2: "Phone Primary" or "Phone-Primary" with dashes or spaces
    if (!phone) {
      const primaryPhoneMatch = customerSection.match(
        /Phone[-\s]*Primary\s+(\d{3}[-.]?\d{3}[-.]?\d{4})/i,
      );
      if (primaryPhoneMatch) phone = primaryPhoneMatch[1];
    }

    if (!phone) {
      const phoneMatch = customerSection.match(
        /(?:Phone|Number)\s*[:\s]*(\d{3}[-.]?\d{3}[-.]?\d{4})/i,
      );
      if (phoneMatch) phone = phoneMatch[1];
    }

    if (!phone) {
      const numberMatch = customerSection.match(
        /(?:^|\n)(\d{3}[-.]?\d{3}[-.]?\d{4})/,
      );
      if (numberMatch) phone = numberMatch[1];
    }

    if (phone) {
      addLog(`Found phone: ${phone}`);
    }

    if (phone) {
      const cleanPhone = phone.replace(/[-.\s]/g, "");
      if (cleanPhone.match(/^\d{10}$/)) {
        phone = `(${cleanPhone.slice(0, 3)}) ${cleanPhone.slice(3, 6)}-${cleanPhone.slice(6)}`;
      }
      extracted.customerPhone = phone;
    }

    // ADDRESS - extract from "Address:" label and ensure it has PA suffix
    let address = undefined;

    // Pattern 1: "Address: ..." format (primary method for DMC invoice forms)
    const addressLabelMatch = text.match(/Address\s*:\s*(.+?)(?:\n|$)/i);
    if (addressLabelMatch) {
      address = addressLabelMatch[1]
        .trim()
        .replace(/[|\\]+/g, "")
        .replace(/\$.*/, "") // Remove any dollar amounts
        .replace(/Total.*/, "") // Remove "Total" lines
        .trim();

      // Only reject if address is empty after cleaning
      if (address && address.length > 0) {
        // Clean OCR artifacts from address (e.g., "oR a." from "Wallingford")
        address = address
          .replace(/\boR\s+a\b\.?/gi, "Wallingford") // Common OCR error for Wallingford
          .replace(/\bbrrokhaven\b/gi, "Brookhaven") // Fix double-r OCR error
          .replace(/\s+ree\b/gi, "") // Remove "ree" artifact (often from city names)
          .replace(/\s+,/g, ",") // Fix spacing before commas
          .replace(/,+/g, ",") // Remove duplicate commas
          .trim();
        // Capitalize first letter of each word and street abbreviations
        address = address.replace(/\b([a-z])/g, (m) => m.toUpperCase());
        // Ensure common street abbreviations are proper case (Rd, Ave, St, etc.)
        address = address.replace(
          /\b(RD|AVE|ST|DR|LN|CT|PL|BLVD|HWY|PKY|PKWY|TERR|TERRACE|BLK|BLOCK)\b/gi,
          (m) => m.charAt(0).toUpperCase() + m.slice(1).toLowerCase(),
        );

        // If address doesn't already contain PA/Pennsylvania, add it
        if (address && !/(PA|Pennsylvania|\b19[0-9]{3}\b)/.test(address)) {
          address = address + ", PA";
        }
      } else {
        address = undefined;
      }
    }

    // Pattern 2: Generic address extraction from customer section (avoid table/summary data)
    if (!address) {
      let cleanCustomerSection = customerSection
        .replace(/Total.*$/gm, "") // Remove Total lines
        .replace(/\$.*$/gm, ""); // Remove dollar amount lines
      address = extractAddressFromText(cleanCustomerSection);

      // Clean OCR artifacts from extracted address
      if (address) {
        address = address
          .replace(/\boR\s+a\b\.?/gi, "Wallingford") // Common OCR error for Wallingford
          .replace(/\bbrrokhaven\b/gi, "Brookhaven") // Fix double-r OCR error
          .replace(/\s+ree\b/gi, "") // Remove "ree" artifact (often from city names)
          .replace(/\s+,/g, ",") // Fix spacing before commas
          .replace(/,+/g, ",") // Remove duplicate commas
          .trim();
      }
    }

    if (address) {
      addLog(`Extracted address: ${address}`);
      extracted.customerAddress = address;
    }

    // REPAIR DESCRIPTION - try "Service:" label first, then fall back to trouble section
    let repairDescription: string | undefined;
    addLog(
      `troubleReportedIdx: ${troubleReportedIdx}, customerInfoIdx: ${customerInfoIdx}, itemDescIdx: ${itemDescIdx}`,
    );
    addLog(`Trouble section length: ${troubleSection.length} chars`);
    if (troubleSection) {
      addLog(
        `Trouble section (first 200 chars): ${troubleSection.substring(0, 200)}`,
      );
    }

    // Pattern 1: "Service: ..." or "Performed:" format (old repair form)
    let serviceLabelMatch = text.match(/Service\s*:\s*([^\n]+)/i);
    if (!serviceLabelMatch) {
      serviceLabelMatch = text.match(/Performed\s*:\s*([^\n]+)/i);
    }
    if (serviceLabelMatch) {
      repairDescription = serviceLabelMatch[1]
        .trim()
        .replace(/[|\\]+/g, "")
        .trim();
      console.log("[OCR] Service extracted from label:", repairDescription);
    }

    // Pattern 2: from trouble section (George's Music format)
    if (!repairDescription && troubleReportedIdx >= 0) {
      addLog(`Searching for Trouble Reported in trouble section...`);
      const troubleMatch = troubleSection.match(
        /Trouble\s+Reported\s*:?[\s\S]*?(?=Special\s+Instructions|Technician\s+Comments|Item\s+is\s+being|$)/i,
      );
      if (troubleMatch) {
        addLog(`Found trouble match: ${troubleMatch[0].substring(0, 150)}`);
        let troubleText = troubleMatch[0];
        troubleText = troubleText
          .replace(/Trouble\s+Reported\s*:?/i, "")
          .trim();
        troubleText = troubleText
          .replace(/^[;:|\/\s]+/, "")
          .replace(/[;:|\/\s]+$/, "")
          .trim();

        const linesArr = troubleText
          .split(/\n/)
          .map((l) => l.trim())
          .filter((l) => l && !/^-+$/.test(l) && !/^\d+$/.test(l));
        const filtered = linesArr.filter(
          (l) => !/Service|Return|ORDER|George|Music|^[\/\|]+$/.test(l),
        );

        // Remove lines that are just "/ RETURN ORDER" or variations
        const cleanedFiltered = filtered.filter(
          (l) => !/^\s*\/\s*RETURN\s+ORDER\s*$/i.test(l),
        );

        if (cleanedFiltered.length > 0) {
          let joined = cleanedFiltered.join(" ");
          joined = joined
            .replace(/\s+/g, " ")
            .replace(/\s([.,;!?])/g, "$1")
            .trim();
          if (joined.length > 3) {
            repairDescription = joined;
            addLog(
              `Trouble: Extracted from troubled section: ${joined.substring(0, 80)}`,
            );
          }
        }
      } else {
        addLog(`No trouble match found in section`);
      }
    }

    // Pattern 3: Try more lenient trouble extraction if markers not found
    if (!repairDescription) {
      const troubleMatch = text.match(
        /(?:Trouble\s+Reported|trouble)[\s:]*?([\s\S]{0,500}?)(?=Special\s+Instructions|Special instructions|Technician|Item\s+is\s+being|$)/i,
      );
      if (troubleMatch) {
        let desc = troubleMatch[1]
          .trim()
          .replace(/^[;:|\/\s]+/, "")
          .replace(/[;:|\/\s]+$/, "")
          .trim();
        // Remove lines that are just "/ RETURN ORDER" or variations
        desc = desc.replace(/^\s*\/\s*RETURN\s+ORDER\s*/i, "").trim();
        const descLines = desc
          .split(/\n/)
          .map((l) => l.trim())
          .filter((l) => l && !/George|Music|MUSIC/i.test(l));
        if (descLines.length > 0) {
          desc = descLines.join(" ").replace(/\s+/g, " ").trim();
          if (desc.length > 3) {
            repairDescription = desc;
            addLog(
              `Trouble: Extracted from lenient match: ${desc.substring(0, 80)}`,
            );
          }
        }
      }
    }

    if (!repairDescription) {
      const serviceMatch = text.match(
        /(?:Service|Performed)\s+(?:PERFORMED)?\s*:?\s*([\s\S]{10,200}?)(?:\n|Invoice|$)/i,
      );
      if (serviceMatch) {
        let desc = serviceMatch[1].trim();
        // Filter out "/ RETURN ORDER" and similar artifacts
        desc = desc.replace(/^\s*\/\s*RETURN\s+ORDER\s*/i, "").trim();
        if (desc.length > 3) {
          repairDescription = desc;
          addLog(
            `Service: Extracted from service match: ${desc.substring(0, 80)}`,
          );
        }
      }
    }

    if (repairDescription) {
      // Apply handwriting artifact cleanup to repair description
      repairDescription = cleanHandwritingArtifacts(repairDescription);
      extracted.repairDescription = repairDescription;
      console.log("[OCR] Repair description:", repairDescription);
      addLog(
        `Final repair description: ${repairDescription.substring(0, 100)}`,
      );
    } else {
      addLog(`No repair description found`);
    }

    // MATERIALS - extract from table format with careful multi-line handling
    const materials: Array<{
      description: string;
      quantity: number;
      unitCost: number;
    }> = [];

    addLog(`Materials: Starting extraction from ${lines.length} lines`);

    // Find all lines that contain prices - these mark item lines
    const itemLineIndices: number[] = [];
    for (let idx = 0; idx < lines.length; idx++) {
      const trimmed = lines[idx].trim();
      // Look for lines with price patterns ($ followed by digits)
      // These are typically the last line of an item entry
      if (trimmed.match(/\$[\d.]+/)) {
        itemLineIndices.push(idx);
      }
    }

    addLog(`Materials: Found ${itemLineIndices.length} lines with prices`);

    // Process each item row
    for (const itemLineIdx of itemLineIndices) {
      const itemLine = lines[itemLineIdx].trim();

      // Skip headers and category lines
      if (
        /^(Description|Quantity|Unit|Price|Cost|Total|Subtotal|Tax|Invoice|Date|Service|Address|Number|Attention|Item|Instrument|Recording|Private|Lessons)/i.test(
          itemLine,
        )
      ) {
        addLog(
          `Materials: Skipping header/category line ${itemLineIdx}: "${itemLine.substring(0, 60)}"`,
        );
        continue;
      }

      // Extract prices and numbers from this line
      const priceMatches: number[] = [];
      const dollarPattern = /\$[\d.]+/g;
      let match;
      while ((match = dollarPattern.exec(itemLine)) !== null) {
        const value = parseFloat(match[0].substring(1));
        priceMatches.push(value);
      }

      if (priceMatches.length < 1) {
        addLog(
          `Materials: Line ${itemLineIdx} skipped - no prices found`,
        );
        continue;
      }

      // Extract plain numbers from this line (potential quantity)
      const plainNumberMatches: number[] = [];
      const tokens = itemLine.split(/\s+/);
      for (const token of tokens) {
        if (token.includes("$")) continue;
        if (/^\d+$/.test(token)) {
          const num = parseInt(token, 10);
          if (num > 0 && num < 1000) {
            plainNumberMatches.push(num);
          }
        }
      }

      // IMPORTANT: Look backwards to collect multi-line descriptions
      // Only include lines that look like they're part of the same item description
      // Stop at empty lines or lines that are clearly section headers/category names
      const descLines: string[] = [];

      // Start by looking at lines BEFORE this item line
      for (let i = itemLineIdx - 1; i >= 0; i--) {
        const prevLine = lines[i].trim();

        // Stop at empty line
        if (!prevLine || prevLine.length < 2) break;

        // Stop at section headers or category names
        if (
          /^(Instrument|Recording|Private|Lessons|Description|Quantity|Unit|Price|Cost|Total|Subtotal|Tax|Invoice|Date|Service|Address)/i.test(
            prevLine,
          )
        ) {
          addLog(
            `Materials: Hit section header "${prevLine.substring(0, 40)}" at line ${i}, stopping description collection`,
          );
          break;
        }

        // Skip lines that look like they're just numbers (line artifacts)
        if (/^\d+$/.test(prevLine)) {
          break;
        }

        // Skip lines that only contain numbers and formatting chars
        if (!/[a-zA-Z]/i.test(prevLine)) {
          break;
        }

        // This line is part of the description
        descLines.unshift(prevLine);
      }

      // Add content from the item line itself (after removing prices and quantities)
      let itemLineContent = itemLine;
      itemLineContent = itemLineContent.replace(/\$[\d.]+/g, "").trim();

      // Remove leading numbers (quantity indicator)
      itemLineContent = itemLineContent.replace(/^\d+\s+/, "").trim();

      // Only add if it has letters (actual content)
      if (itemLineContent && /[a-zA-Z]/i.test(itemLineContent)) {
        descLines.push(itemLineContent);
      }

      // Join all description lines
      let fullDesc = descLines.join(" ").trim();

      if (!fullDesc || fullDesc.length < 3) {
        addLog(
          `Materials: Line ${itemLineIdx} skipped - no valid description content`,
        );
        continue;
      }

      // Normalize whitespace
      fullDesc = fullDesc.replace(/\s+/g, " ").trim();

      // Clean up OCR artifacts and punctuation
      fullDesc = fullDesc.replace(/^\s*[\-:|;/]+\s*/, "").trim();
      fullDesc = fullDesc.replace(/\s*[\-:|;/]+\s*$/, "").trim();

      // Determine quantity and price
      let qty = 1;
      let price = 0;

      if (plainNumberMatches.length > 0) {
        const candidateQty = plainNumberMatches[0];
        const unitPrice =
          priceMatches[priceMatches.length - 2] || priceMatches[0];
        const totalPrice =
          priceMatches[priceMatches.length - 1] || priceMatches[0];
        const calcQty = Math.round(totalPrice / unitPrice);

        if (calcQty === candidateQty || candidateQty === 1) {
          qty = candidateQty;
          price = unitPrice;
        } else {
          qty = Math.max(1, calcQty);
          price = unitPrice;
        }
      } else {
        if (priceMatches.length >= 2) {
          const unitPrice = priceMatches[priceMatches.length - 2];
          const totalPrice = priceMatches[priceMatches.length - 1];
          qty = Math.max(1, Math.round(totalPrice / unitPrice));
          price = unitPrice;
        } else if (priceMatches.length === 1) {
          qty = 1;
          price = priceMatches[0];
        }
      }

      addLog(
        `Materials: Parsed line ${itemLineIdx} - qty=${qty}, price=$${price.toFixed(2)}, desc='${fullDesc.substring(0, 70)}'`,
      );

      if (price > 0) {
        materials.push({
          description: fullDesc,
          quantity: qty > 0 ? qty : 1,
          unitCost: price,
        });
        addLog(
          `✅ Materials: ADDED - ${fullDesc.substring(0, 70)}... × ${qty} @ $${price.toFixed(2)}`,
        );
      } else {
        addLog(
          `❌ Materials: SKIPPED - Invalid price $${price.toFixed(2)}`,
        );
      }
    }

    if (materials.length > 0) {
      extracted.materials = materials;

      // If any material line contains 'delivery' assume delivery already accounted for
      if (materials.some((m) => /delivery/i.test(m.description))) {
        extracted.isNoDeliveryFee = true;
        addLog(
          'Detected material containing "delivery"; setting isNoDeliveryFee',
        );
      }
    } else {
      // Also check repairDescription for delivery mention
      if (repairDescription && /delivery/i.test(repairDescription)) {
        extracted.isNoDeliveryFee = true;
        addLog(
          'Detected "delivery" in repair description; setting isNoDeliveryFee',
        );
      }
    }

    // Instruments
    let instrumentType = "Guitar";
    let instrumentDescription = "";
    const itemDescMatch = topSection.match(
      /Item\s+Description[\s:]*([^\n]+?)(?:\n|Qty|Quantity|SKU|Serial|Condition|$)/i,
    );
    if (itemDescMatch) {
      let desc = itemDescMatch[1].trim();
      // Remove leading special characters but preserve the actual description
      desc = desc.replace(/^[=\-:|\/\s]+/, "").trim();
      // Only trim trailing special characters that aren't part of common instrument names
      desc = desc.replace(/[\s\-:|\[\]nt]+$/, "").trim();
      // Remove leading/trailing slashes and "RETURN ORDER" completely
      desc = desc.replace(/\s*\/\s*RETURN\s+ORDER\s*$/i, "").trim();
      desc = desc.replace(/^[\/\s]+/, "").trim();
      // Remove OCR artifacts like "pe" (likely OCR misread of model marker) and "__" (line gaps)
      desc = desc.replace(/\s+pe\s+/gi, " ").trim();
      desc = desc.replace(/\s+__\s+/g, " ").trim();
      desc = desc.replace(/\s+_+\s+/g, " ").trim();
      desc = desc.replace(/\s+ee\s+/g, " ").trim();
      // Remove standalone "OR" OCR artifact (often appears between instrument name and other content)
      desc = desc.replace(/\s+OR\s*$/i, "").trim();
      desc = desc.replace(/\s+OR\s+/gi, " ").trim();
      desc = desc.replace(/\s+/g, " ").trim();
      desc = desc.replace(/Fernandez/g, "Fernandes");

      // Only use if it's not just "RETURN ORDER" or empty
      if (desc.length > 2 && !/^RETURN\s+ORDER$/i.test(desc)) {
        instrumentDescription = cleanHandwritingArtifacts(desc);
        addLog(`Instrument description: ${instrumentDescription}`);
      }

      const serialMatch = topSection.match(/Serial\s*#?[\s:]*([A-Z0-9;]+)/i);
      if (serialMatch && instrumentDescription.length < 80) {
        instrumentDescription += " (Serial: " + serialMatch[1] + ")";
        addLog(`Added serial number: ${serialMatch[1]}`);
      }
    }

    const fullText = (
      instrumentDescription +
      " " +
      (extracted.repairDescription || "")
    ).toLowerCase();
    if (fullText.includes("guitar")) instrumentType = "Guitar";
    else if (fullText.includes("bass")) instrumentType = "Bass";
    else if (fullText.includes("violin")) instrumentType = "Violin";
    else if (fullText.includes("cello")) instrumentType = "Cello";
    else if (fullText.includes("fernandes") || fullText.includes("ravelle"))
      instrumentType = "Guitar";

    const finalInstrumentDesc =
      instrumentDescription || extracted.repairDescription || "Repair";
    if (finalInstrumentDesc)
      extracted.instruments = [
        { type: instrumentType, description: finalInstrumentDesc },
      ];

    extracted.debugLog = debugLog;
    return extracted;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("OCR Error:", errorMsg);

    if (errorMsg.includes("Image failed to load")) {
      throw new Error(
        "Failed to load image. Please ensure the file is a valid image (JPG, PNG, etc.).",
      );
    } else if (errorMsg.includes("timeout")) {
      throw new Error(
        "Image processing took too long. Please try with a different image.",
      );
    } else if (errorMsg.includes("canvas")) {
      throw new Error("Failed to process image. The file may be corrupted.");
    } else if (errorMsg.includes("OCR")) {
      throw new Error(
        "Text recognition failed. Please try with a clearer image.",
      );
    } else {
      throw new Error("Failed to extract invoice data: " + errorMsg);
    }
  }
};
