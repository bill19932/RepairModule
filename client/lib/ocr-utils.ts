import heic2any from "heic2any";

export interface ExtractedInvoiceData {
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerAddress?: string;
  dateReceived?: string;
  instruments?: Array<{ type: string; description: string }>;
  repairDescription?: string;
  materials?: Array<{
    description: string;
    quantity: number;
    unitCost: number;
  }>;
  laborHours?: number;
  hourlyRate?: number;
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
    const blob = await heic2any({ blob: file }) as Blob;
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
    console.warn("Proceeding without HEIC->JPEG conversion; OCR may fail for HEIC images.");
    return file;
  }
};

// Helper to find customer address (not store address)
// Now receives the customerSection text already isolated
const extractAddressFromText = (customerSectionText: string): string | undefined => {
  const lines = customerSectionText.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Skip obvious store lines
    if (/Woodland|1025\s+E|George's\s+Music|Springfield/i.test(trimmed)) {
      continue;
    }

    // Match street address: number + street name/type + optional apt
    if (/^\d{1,5}\s+[\w\s&,.'-]+(?:Lane|Ln|Street|St|Ave|Avenue|Road|Rd|Drive|Dr|Way|Blvd|Boulevard|Court|Ct|Place|Pl|Terrace|Terr)*/i.test(trimmed)) {
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

        if (/Phone|Email|Signature|Primary|Second|Follow|Picked|Technician/i.test(nextLine)) {
          break;
        }

        if (!cityFound && /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?(?:\s+[A-Z][a-z]+)?$/.test(nextLine) && !/PA|Pennsylvania|State|Zip/i.test(nextLine)) {
          addressParts.push(nextLine);
          cityFound = true;
          nextIdx++;
          continue;
        }

        if (!stateZipFound && ( /\bPA\b|\bPennsylvania\b/i.test(nextLine) || /\d{5}/.test(nextLine) )) {
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

        if (/Phone|Email|Signature|Primary|Second|Follow|Picked|Technician|[A-Z]{2,}\s*(?:\d{5})?$/.test(nextLine) && stateZipFound) {
          break;
        }

        if (addressParts.length >= 2) break;
        nextIdx++;
      }

      let fullAddress = addressParts.join(", ");
      fullAddress = fullAddress.replace(/\bPc\b/g, "").replace(/,\s*,/g, ",").trim();

      if (addressParts.length >= 2) return fullAddress;
    }
  }

  return undefined;
};

// Helper to find invoice number
const extractInvoiceNumber = (text: string): string | undefined => {
  const labelMatch = text.match(/Invoice\s*#\s*([A-Z0-9-]+)/i);
  if (labelMatch && !labelMatch[1].match(/^\d{5}$/)) {
    return labelMatch[1];
  }
  return undefined;
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
        console.error("Image load failed. File size:", processFile.size, "Type:", processFile.type);
        reject(new Error("Image failed to load - file may be corrupted or invalid format"));
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
          reject(new Error("Failed to process image canvas: " + (err as Error).message));
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
            console.log("OCR progress:", Math.round((m.progress || 0) * 100) + "%");
          } catch (e) {
            // ignore
          }
        }
      };

      // Try to use global Tesseract first (CDN). If not available, use the npm package.
      const globalT = (typeof window !== 'undefined' ? (window as any).Tesseract : undefined);
      if (globalT && typeof globalT.recognize === 'function') {
        console.log("Using global Tesseract");
        ocrResult = await globalT.recognize(normalizedDataUrl, 'eng', { logger: logProgress });
      } else {
        console.log("Using tesseract.js npm package");
        try {
          const Tesseract = await import('tesseract.js');
          // Call recognize directly on the default export
          ocrResult = await Tesseract.default.recognize(normalizedDataUrl, 'eng', { logger: logProgress });
        } catch (workerErr) {
          console.warn("Worker-based OCR failed, trying alternative:", workerErr);
          // Fallback: try the named export
          const { recognize } = await import('tesseract.js');
          ocrResult = await recognize(normalizedDataUrl, 'eng', { logger: logProgress });
        }
      }

      console.log('OCR completed successfully');
    } catch (err) {
      console.error('Tesseract failed:', err);
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error('OCR processing failed: ' + msg);
    }

    const text = (ocrResult && (ocrResult.data?.text || (ocrResult as any).text)) ? (ocrResult.data?.text || (ocrResult as any).text || '') : '';
    const extracted: ExtractedInvoiceData = {};

    const lines = text.split("\n");

    // Find key markers
    let troubleReportedIdx = -1;
    let customerInfoIdx = -1;
    let itemDescIdx = -1;

    for (let i = 0; i < lines.length; i++) {
      if (/Trouble\s+Reported/i.test(lines[i])) troubleReportedIdx = i;
      if (/CUSTOMER\s+INFORMATION/i.test(lines[i])) customerInfoIdx = i;
      if (/Item\s+Description/i.test(lines[i])) itemDescIdx = i;
    }

    const topSection = troubleReportedIdx > 0 ? lines.slice(0, troubleReportedIdx).join("\n") : text.substring(0, text.indexOf("Trouble") > 0 ? text.indexOf("Trouble") : text.length);
    const troubleSection = troubleReportedIdx > 0 ? lines.slice(troubleReportedIdx, customerInfoIdx > troubleReportedIdx ? customerInfoIdx : lines.length).join("\n") : "";
    const customerSection = customerInfoIdx > 0 ? lines.slice(customerInfoIdx).join("\n") : text;

    // Invoice Number
    const invoiceNum = extractInvoiceNumber(text);
    if (invoiceNum) extracted.invoiceNumber = invoiceNum;

    // DATE - try direct "Date:" label first, then fall back to generic extraction
    let dateReceived: string | undefined;

    // Pattern 1: "Date: MM/DD/YY" format
    const dateLabelMatch = text.match(/Date\s*:\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/i);
    if (dateLabelMatch) {
      const month = dateLabelMatch[1].padStart(2, "0");
      const day = dateLabelMatch[2].padStart(2, "0");
      const year = dateLabelMatch[3].length === 2 ? ("20" + dateLabelMatch[3]) : dateLabelMatch[3];
      dateReceived = `${year}-${month}-${day}`;
    }

    // Pattern 2: date near "Service Location" label (George's Music format)
    if (!dateReceived) {
      const svcLineIndex = lines.findIndex(l => /Service\s+Location/i.test(l));
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
            const year = m[3].length === 2 ? ("20" + m[3]) : m[3];
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
          const year = m[3].length === 2 ? ("20" + m[3]) : m[3];
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
      customerName = attentionMatch[1].trim().replace(/[|\\]+/g, "").trim();
    }

    // Pattern 2: look after CUSTOMER INFORMATION marker and pick first plausible name line
    if (!customerName && customerInfoIdx > -1) {
      const afterMarkerLines = lines.slice(customerInfoIdx + 1, customerInfoIdx + 8);

      const isLikelyName = (s: string) => {
        if (!s) return false;
        // remove stray punctuation
        const clean = s.replace(/[^A-Za-z\s'\-]/g, "").trim();
        if (!clean) return false;
        const parts = clean.split(/\s+/).filter(Boolean);
        if (parts.length < 2) return false;
        // require each part to have at least 2 letters
        if (parts.some(p => p.replace(/[\-' ]/g, "").length < 2)) return false;
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
        if (t.length > 2 && /^[A-Za-z\s'\-]+$/.test(t) && t.split(/\s+/).length >= 2) {
          customerName = t.replace(/[|\[\]]+/g, "").trim();
          break;
        }
      }
    }

    if (customerName) extracted.customerName = customerName;

    // EMAIL - find all emails and prefer non-store ones
    let selectedEmail: string | undefined;
    const allEmails = Array.from(text.matchAll(/([a-zA-Z0-9][a-zA-Z0-9._%+\-]*@[a-zA-Z0-9][a-zA-Z0-9.\-]*\.[a-zA-Z]{2,})/gi));

    if (allEmails.length > 0) {
      for (const m of allEmails) {
        const email = m[1];
        if (email.toLowerCase().includes("springfield") || email.toLowerCase().includes("george") || email.toLowerCase().includes("georges")) continue;
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
      const primaryPhoneMatch = customerSection.match(/Phone[-\s]*Primary[\s:\s]*(\d{10,})/i);
      if (primaryPhoneMatch) phone = primaryPhoneMatch[1];
    }

    if (!phone) {
      const phoneMatch = customerSection.match(/(?:Phone|Number)\s*[:\s]*(\d{3}[-.]?\d{3}[-.]?\d{4})/i);
      if (phoneMatch) phone = phoneMatch[1];
    }

    if (!phone) {
      const numberMatch = customerSection.match(/(?:^|\n)(\d{3}[-.]?\d{3}[-.]?\d{4})/);
      if (numberMatch) phone = numberMatch[1];
    }

    if (phone) {
      const cleanPhone = phone.replace(/[-.\s]/g, "");
      if (cleanPhone.match(/^\d{10}$/)) {
        phone = `(${cleanPhone.slice(0, 3)}) ${cleanPhone.slice(3, 6)}-${cleanPhone.slice(6)}`;
      }
      extracted.customerPhone = phone;
    }

    // ADDRESS - try direct "Address:" label first, then fall back to generic extraction
    let address = undefined;

    // Pattern 1: "Address: ..." format
    const addressLabelMatch = text.match(/Address\s*:\s*([^\n]+)/i);
    if (addressLabelMatch) {
      address = addressLabelMatch[1].trim().replace(/[|\\]+/g, "").trim();
    }

    // Pattern 2: Generic address extraction from customer section
    if (!address) {
      address = extractAddressFromText(customerSection);
    }

    if (address) extracted.customerAddress = address;

    // REPAIR DESCRIPTION - try "Service:" label first, then fall back to trouble section
    let repairDescription: string | undefined;

    // Pattern 1: "Service: ..." format
    const serviceLabelMatch = text.match(/Service\s*:\s*([^\n]+)/i);
    if (serviceLabelMatch) {
      repairDescription = serviceLabelMatch[1].trim().replace(/[|\\]+/g, "").trim();
    }

    // Pattern 2: from trouble section (George's Music format)
    if (!repairDescription) {
      const troubleMatch = troubleSection.match(/Trouble\s+Reported\s*:?[\s\S]*?(?=Special\s+Instructions|Technician\s+Comments|Item\s+is\s+being|$)/i);
      if (troubleMatch) {
        let troubleText = troubleMatch[0];
        troubleText = troubleText.replace(/Trouble\s+Reported\s*:?/i, "").trim();
        troubleText = troubleText.replace(/^[;:|\/\s]+/, "").replace(/[;:|\/\s]+$/, "").trim();

        const linesArr = troubleText.split(/\n/).map(l => l.trim()).filter(l => l && !/^-+$/.test(l) && !/^\d+$/.test(l));
        const filtered = linesArr.filter(l => !/Service|Return|ORDER|George|Music/i.test(l));
        if (filtered.length > 0) {
          let joined = filtered.join(" ");
          joined = joined.replace(/\s+/g, " ").replace(/\s([.,;!?])/g, "$1").trim();
          if (joined.length > 3) repairDescription = joined;
        }
      }
    }

    if (!repairDescription) {
      const serviceMatch = text.match(/Service\s+([\s\S]{10,200}?)(?:\n|Invoice|$)/i);
      if (serviceMatch) repairDescription = serviceMatch[1].trim();
    }

    if (repairDescription) extracted.repairDescription = repairDescription;

    // Instruments
    let instrumentType = "Guitar";
    let instrumentDescription = "";
    const itemDescMatch = topSection.match(/Item\s+Description[\s:]*([^\n]+?)(?:\n|Qty|Quantity|SKU|Serial|Condition|$)/i);
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

    const fullText = (instrumentDescription + " " + (extracted.repairDescription || "")).toLowerCase();
    if (fullText.includes("guitar")) instrumentType = "Guitar";
    else if (fullText.includes("bass")) instrumentType = "Bass";
    else if (fullText.includes("violin")) instrumentType = "Violin";
    else if (fullText.includes("cello")) instrumentType = "Cello";
    else if (fullText.includes("fernandes") || fullText.includes("ravelle")) instrumentType = "Guitar";

    const finalInstrumentDesc = instrumentDescription || extracted.repairDescription || "Repair";
    if (finalInstrumentDesc) extracted.instruments = [{ type: instrumentType, description: finalInstrumentDesc }];

    return extracted;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("OCR Error:", errorMsg);

    if (errorMsg.includes("Image failed to load")) {
      throw new Error("Failed to load image. Please ensure the file is a valid image (JPG, PNG, etc.).");
    } else if (errorMsg.includes("timeout")) {
      throw new Error("Image processing took too long. Please try with a different image.");
    } else if (errorMsg.includes("canvas")) {
      throw new Error("Failed to process image. The file may be corrupted.");
    } else if (errorMsg.includes("OCR")) {
      throw new Error("Text recognition failed. Please try with a clearer image.");
    } else {
      throw new Error("Failed to extract invoice data: " + errorMsg);
    }
  }
};
