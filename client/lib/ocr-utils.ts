import heic2any from "heic2any";

export interface ExtractedInvoiceData {
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerAddress?: string;
  dateReceived?: string;
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

    // Find key markers
    let troubleReportedIdx = -1;
    let customerInfoIdx = -1;
    let itemDescIdx = -1;

    for (let i = 0; i < lines.length; i++) {
      if (/Trouble\s+Reported/i.test(lines[i])) troubleReportedIdx = i;
      if (/CUSTOMER\s+INFORMATION/i.test(lines[i])) customerInfoIdx = i;
      if (/Item\s+Description/i.test(lines[i])) itemDescIdx = i;
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

    if (dateReceived) extracted.dateReceived = dateReceived;

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
      const afterMarkerLines = lines.slice(
        customerInfoIdx + 1,
        customerInfoIdx + 8,
      );

      const isLikelyName = (s: string) => {
        if (!s) return false;
        // remove stray punctuation
        const clean = s.replace(/[^A-Za-z\s'\-]/g, "").trim();
        if (!clean) return false;
        const parts = clean.split(/\s+/).filter(Boolean);
        if (parts.length < 2) return false;
        // require each part to have at least 2 letters
        if (parts.some((p) => p.replace(/[\-' ]/g, "").length < 2))
          return false;
        // avoid lines that are all uppercase codes or contain digits
        if (/\d/.test(s)) return false;
        if (/^[A-Z0-9]{3,}$/.test(s.replace(/\s+/g, ""))) return false;
        return true;
      };

      for (const l of afterMarkerLines) {
        const t = l.trim();
        if (!t) continue;
        // Some OCR outputs include lines like 'SF8855' above name — skip those that include digits or are short
        if (isLikelyName(t)) {
          customerName = t.replace(/[|\[\]]+/g, "").trim();
          break;
        }
      }
    }

    // Fallback: try to find a likely name near the bottom of the page (before Phone/Email labels)
    if (!customerName) {
      // search for lines that look like names within last 10 lines
      const tail = lines.slice(Math.max(0, lines.length - 12));
      for (const l of tail) {
        const t = l.trim();
        if (!t) continue;
        if (
          t.length > 2 &&
          /^[A-Za-z\s'\-]+$/.test(t) &&
          t.split(/\s+/).length >= 2
        ) {
          customerName = t.replace(/[|\[\]]+/g, "").trim();
          break;
        }
      }
    }

    if (customerName) {
      // Clean customerName from OCR artifacts like 'pw', 'p/w', or '(w)'
      let cleanName = customerName
        .replace(/\(w\)/gi, "")
        .replace(/\b(?:pw|p\/w)\b[:.,]*/gi, "")
        .replace(/[|\[\]]+/g, "")
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

    if (allEmails.length > 0) {
      for (const m of allEmails) {
        const email = m[1];
        if (
          email.toLowerCase().includes("springfield") ||
          email.toLowerCase().includes("george") ||
          email.toLowerCase().includes("georges")
        )
          continue;
        selectedEmail = email;
        break;
      }
      if (!selectedEmail) selectedEmail = allEmails[0][1];
    }

    if (selectedEmail) extracted.customerEmail = selectedEmail.trim();

    // PHONE - look specifically for Number: or Phone: labels
    let phone: string | undefined;

    // Pattern 1: "Number: XXXXXXXXXX" format
    const numberLabelMatch = text.match(/Number\s*:\s*(\d{7,})/i);
    if (numberLabelMatch) phone = numberLabelMatch[1];

    // Pattern 2: "Phone Primary" or similar format
    if (!phone) {
      const primaryPhoneMatch = customerSection.match(
        /Phone[-\s]*Primary[\s:\s]*(\d{10,})/i,
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
      const cleanPhone = phone.replace(/[-.\s]/g, "");
      if (cleanPhone.match(/^\d{10}$/)) {
        phone = `(${cleanPhone.slice(0, 3)}) ${cleanPhone.slice(3, 6)}-${cleanPhone.slice(6)}`;
      }
      extracted.customerPhone = phone;
    }

    // ADDRESS - extract from "Address:" label and ensure it has PA suffix
    let address = undefined;

    // Pattern 1: "Address: ..." format (primary method for old repair forms)
    const addressLabelMatch = text.match(/Address\s*:\s*([^\n]+)/i);
    if (addressLabelMatch) {
      address = addressLabelMatch[1]
        .trim()
        .replace(/[|\\]+/g, "")
        .trim();

      // If address doesn't already contain PA/Pennsylvania, add it
      if (address && !/(PA|Pennsylvania|\b19[0-9]{3}\b)/.test(address)) {
        // Try to find city and zip from the full text to add proper PA suffix
        // For now, append ", PA" to the address
        address = address + ", PA";
      }
    }

    // Pattern 2: Generic address extraction from customer section
    if (!address) {
      address = extractAddressFromText(customerSection);
    }

    if (address) extracted.customerAddress = address;

    // REPAIR DESCRIPTION - try "Service:" label first, then fall back to trouble section
    let repairDescription: string | undefined;

    // Pattern 1: "Service: ..." format (old repair form)
    let serviceLabelMatch = text.match(/Service\s*:\s*([^\n]+)/i);
    if (serviceLabelMatch) {
      repairDescription = serviceLabelMatch[1]
        .trim()
        .replace(/[|\\]+/g, "")
        .trim();
      console.log("[OCR] Service extracted from label:", repairDescription);
    }

    // Pattern 2: from trouble section (George's Music format)
    if (!repairDescription) {
      const troubleMatch = troubleSection.match(
        /Trouble\s+Reported\s*:?[\s\S]*?(?=Special\s+Instructions|Technician\s+Comments|Item\s+is\s+being|$)/i,
      );
      if (troubleMatch) {
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
          (l) => !/Service|Return|ORDER|George|Music/i.test(l),
        );
        if (filtered.length > 0) {
          let joined = filtered.join(" ");
          joined = joined
            .replace(/\s+/g, " ")
            .replace(/\s([.,;!?])/g, "$1")
            .trim();
          if (joined.length > 3) repairDescription = joined;
        }
      }
    }

    if (!repairDescription) {
      const serviceMatch = text.match(
        /Service\s+([\s\S]{10,200}?)(?:\n|Invoice|$)/i,
      );
      if (serviceMatch) repairDescription = serviceMatch[1].trim();
    }

    if (repairDescription) {
      extracted.repairDescription = repairDescription;
      console.log("[OCR] Repair description:", repairDescription);
    }

    // MATERIALS - extract from table format
    const materials: Array<{
      description: string;
      quantity: number;
      unitCost: number;
    }> = [];

    addLog(`Materials: Starting extraction from ${lines.length} lines`);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.length < 3) {
        continue;
      }

      // Skip headers and metadata rows
      if (
        /^(Description|Quantity|Unit|Price|Cost|Total|Subtotal|Tax|Invoice|Date|Service|Address|Number|Attention|Subtotal|Item)/i.test(
          trimmed,
        )
      )
        continue;

      // Must contain at least one price pattern ($X.XX)
      if (!trimmed.match(/\$[\d.]+/)) continue;

      addLog(`Materials: Processing line: "${trimmed}"`);

      // Extract dollar amounts (prices) - look for $X.XX patterns
      const priceMatches: number[] = [];
      const dollarPattern = /\$[\d.]+/g;
      let match;
      while ((match = dollarPattern.exec(trimmed)) !== null) {
        const value = parseFloat(match[0].substring(1));
        priceMatches.push(value);
      }

      // Also extract plain whole numbers between 1-999 (potential quantity)
      const plainNumberMatches: number[] = [];
      // Split line and check each token
      const tokens = trimmed.split(/\s+/);
      for (const token of tokens) {
        // Skip tokens with $ signs
        if (token.includes("$")) continue;
        // Look for plain integer numbers
        if (/^\d+$/.test(token)) {
          const num = parseInt(token, 10);
          if (num > 0 && num < 1000) {
            plainNumberMatches.push(num);
          }
        }
      }

      addLog(
        `Materials: Found ${priceMatches.length} prices and ${plainNumberMatches.length} plain numbers`,
      );

      // Need at least 2 prices for unit price and total
      if (priceMatches.length < 2) {
        addLog(
          `Materials: Skipped - only ${priceMatches.length} price(s) found`,
        );
        continue;
      }

      // Determine quantity and unit price
      let qty = 1;
      let price = 0;

      if (plainNumberMatches.length > 0) {
        // If we have a plain number between 1-999, likely the quantity
        const candidateQty = plainNumberMatches[0];
        // Verify it makes sense: total should equal qty * unitPrice
        // Try each price as unit price
        const unitPrice =
          priceMatches[priceMatches.length - 2] || priceMatches[0];
        const totalPrice =
          priceMatches[priceMatches.length - 1] || priceMatches[0];
        const calcQty = Math.round(totalPrice / unitPrice);

        if (calcQty === candidateQty || candidateQty === 1) {
          qty = candidateQty;
          price = unitPrice;
        } else {
          // Candidate qty doesn't match, might be part of description
          // Default to qty=1 and use the calculated quantity instead
          qty = Math.max(1, Math.round(totalPrice / unitPrice));
          price = unitPrice;
        }
      } else {
        // No explicit plain number
        // If we have 2+ prices, calculate qty from them
        if (priceMatches.length >= 2) {
          const unitPrice = priceMatches[priceMatches.length - 2];
          const totalPrice = priceMatches[priceMatches.length - 1];
          qty = Math.max(1, Math.round(totalPrice / unitPrice));
          price = unitPrice;
        } else {
          // Only 1 price, default qty=1
          qty = 1;
          price = priceMatches[0];
        }
      }

      // Extract description: remove only prices and quantity from the END of the line
      let desc = trimmed;

      // Remove all dollar amounts first
      desc = desc.replace(/\$[\d.]+/g, "").trim();

      // Remove quantity and other numbers from the end of the line (right side)
      desc = desc.replace(/\s+\d+\s*$/, "").trim();
      desc = desc.replace(/\s+$/, "").trim();

      // Remove common service category prefixes that shouldn't be in the description
      const serviceCategories = [
        "private lessons",
        "instrument repairs",
        "recording services",
        "lessons",
      ];
      for (const category of serviceCategories) {
        const categoryRegex = new RegExp(`^${category}\\s+`, "i");
        if (categoryRegex.test(desc)) {
          desc = desc.replace(categoryRegex, "").trim();
          break;
        }
      }

      // Clean up punctuation at boundaries
      desc = desc.replace(/^\s*[\-:|;/]+\s*/, "").trim();
      desc = desc.replace(/\s*[\-:|;/]+\s*$/, "").trim();

      // Normalize whitespace
      desc = desc.replace(/\s+/g, " ").trim();

      addLog(
        `Materials: Parsed - qty=${qty}, price=$${price.toFixed(2)}, desc='${desc}'`,
      );

      // Validate and add
      if (qty > 0 && price > 0 && desc && desc.length > 2) {
        materials.push({
          description: desc,
          quantity: qty,
          unitCost: price,
        });
        addLog(`✅ Materials: ADDED - ${desc} × ${qty} @ $${price.toFixed(2)}`);
      } else {
        addLog(
          `❌ Materials: SKIPPED - qty=${qty}, price=${price.toFixed(2)}, desc_len=${desc.length}`,
        );
      }
    }

    if (materials.length > 0) {
      extracted.materials = materials;
    }

    // Instruments
    let instrumentType = "Guitar";
    let instrumentDescription = "";
    const itemDescMatch = topSection.match(
      /Item\s+Description[\s:]*([^\n]+?)(?:\n|Qty|Quantity|SKU|Serial|Condition|$)/i,
    );
    if (itemDescMatch) {
      let desc = itemDescMatch[1].trim();
      desc = desc.replace(/^[=\-:|\/\s]+/, "").trim();
      desc = desc.replace(/[\s\-:|\/\[\]nt]+$/, "").trim();
      desc = desc.replace(/\s+ee\s+/g, " ").trim();
      desc = desc.replace(/\s+/g, " ").trim();
      desc = desc.replace(/Fernandez/g, "Fernandes");
      if (desc.length > 0) instrumentDescription = desc;

      const serialMatch = topSection.match(/Serial\s*#[\s:]*([A-Z0-9]+)/i);
      if (serialMatch && instrumentDescription.length < 80) {
        instrumentDescription += " (Serial: " + serialMatch[1] + ")";
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
