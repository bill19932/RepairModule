import Tesseract from "tesseract.js";
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
    console.error("HEIC conversion failed:", error);
    throw new Error(
      "HEIC conversion failed. Please convert to JPG or PNG and try again.",
    );
  }
};

// Helper to find customer address (not store address)
const extractAddressFromText = (text: string): string | undefined => {
  // For George's Music forms, the customer address is in the bottom section after "CUSTOMER INFORMATION"
  // Address format: street with apt, city name, state/zip on separate lines

  const lines = text.split("\n");
  let customerSectionStart = -1;

  // Find where the customer information section starts
  for (let i = 0; i < lines.length; i++) {
    if (/CUSTOMER\s+INFORMATION/i.test(lines[i])) {
      customerSectionStart = i + 1;
      break;
    }
  }

  const searchStart = customerSectionStart > 0 ? customerSectionStart : 0;

  // Look for street address in the customer section
  for (let i = searchStart; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Skip store address indicators
    if (/Woodland|1025\s+E|George's\s+Music|Springfield/i.test(trimmed)) {
      continue;
    }

    // Match street address: number + street name/type + optional apt
    if (/^\d{1,5}\s+[\w\s&,.'-]+(?:Lane|Ln|Street|St|Ave|Avenue|Road|Rd|Drive|Dr|Way|Blvd|Boulevard|Court|Ct|Place|Pl)/i.test(trimmed)) {
      const addressParts: string[] = [trimmed];
      let nextIdx = i + 1;

      // Collect the next 2-3 lines that look like city/state/zip
      let cityFound = false;
      let stateZipFound = false;

      while (nextIdx < lines.length && (addressParts.length < 4)) {
        const nextLine = lines[nextIdx].trim();

        if (!nextLine) {
          nextIdx++;
          continue;
        }

        // Stop if we hit labels like "Phone", "Email", "Signature", etc
        if (/Phone|Email|Signature|Primary|Second|Follow|Picked|Technician/i.test(nextLine)) {
          break;
        }

        // Try to match city name (capital letters, no numbers, 1-3 words)
        if (!cityFound && /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?(?:\s+[A-Z][a-z]+)?$/.test(nextLine) && !/PA|Pennsylvania|State|Zip/i.test(nextLine)) {
          addressParts.push(nextLine);
          cityFound = true;
          nextIdx++;
          continue;
        }

        // Try to match state and/or zip code
        if (!stateZipFound && (/\bPA\b|\bPennsylvania\b/i.test(nextLine) || /\d{5}/.test(nextLine))) {
          // Extract state and zip from this line
          const stateMatch = nextLine.match(/\bPA\b/i);
          const zipMatch = nextLine.match(/\b(\d{5})\b/);

          if (stateMatch || zipMatch) {
            const stateStr = stateMatch ? "PA" : "";
            const zipStr = zipMatch ? zipMatch[1] : "";
            const stateZipStr = [stateStr, zipStr].filter(Boolean).join(" ");
            if (stateZipStr) {
              addressParts.push(stateZipStr);
            }
            stateZipFound = true;
          }
          nextIdx++;
          continue;
        }

        // If we've collected address parts and hit something unexpected, stop
        if (addressParts.length >= 2) {
          break;
        }

        nextIdx++;
      }

      // Construct full address
      const fullAddress = addressParts.join(", ");

      // Validate it looks like an address
      if (!/^\d+\s+\d+\s+\d+|Quantity|Cost|Price|Description/i.test(fullAddress) && addressParts.length >= 2) {
        return fullAddress;
      }
    }
  }

  return undefined;
};

// Helper to find invoice number
const extractInvoiceNumber = (text: string): string | undefined => {
  // Only extract invoice number if it's explicitly labeled "Invoice" or "Invoice #"
  // Don't extract random 5-digit numbers as they might be zip codes

  // Look for explicit "Invoice #" or "Invoice Number" format
  const labelMatch = text.match(/Invoice\s*#\s*([A-Z0-9]+)/i);
  if (labelMatch && !labelMatch[1].match(/^\d{5}$/)) {
    // Don't return if it's just 5 digits (likely a zip code)
    return labelMatch[1];
  }

  // For George's Music forms, invoice number might not be present
  // Return undefined if we can't confidently extract it
  return undefined;
};

export const extractInvoiceData = async (
  imageFile: File,
): Promise<ExtractedInvoiceData> => {
  try {
    // Convert HEIC/HEIF to JPEG if needed
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
      ocrResult = await Tesseract.recognize(normalizedDataUrl, "eng", {
        logger: (m: any) => {
          if (m.status === "recognizing") {
            console.log("OCR progress:", Math.round(m.progress * 100) + "%");
          }
        },
      });
      console.log("OCR completed successfully");
    } catch (err) {
      console.error("Tesseract failed:", err);
      throw new Error("OCR processing failed: " + (err as Error).message);
    }

    const text = ocrResult?.data?.text || "";
    const extracted: ExtractedInvoiceData = {};

    // Invoice Number - with full sweep logic
    const invoiceNum = extractInvoiceNumber(text);
    if (invoiceNum) {
      (extracted as any).invoiceNumber = invoiceNum;
    }

    // Date Received - find the service date from the form
    // George's forms have TWO dates: service date (10/13) and current date (10/29)
    // Service date appears AFTER "Service Location" label, current date is elsewhere

    // Look for pattern: Service Location label followed by a date
    const serviceLocMatch = text.match(/Service\s+Location[^\n]*\n[^\n]*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/i);

    if (serviceLocMatch) {
      const month = serviceLocMatch[1].padStart(2, "0");
      const day = serviceLocMatch[2].padStart(2, "0");
      const year = serviceLocMatch[3];
      extracted.dateReceived = `${year}-${month}-${day}`;
    } else {
      // Fallback: look for date before "Item Description"
      const itemDescIndex = text.indexOf("Item");
      const troubleIndex = text.indexOf("Trouble");
      const searchEndIndex = itemDescIndex > 0 ? itemDescIndex : (troubleIndex > 0 ? troubleIndex : text.length);
      const textSearchArea = text.substring(0, searchEndIndex);

      const allDateMatches = Array.from(textSearchArea.matchAll(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/g));

      if (allDateMatches && allDateMatches.length > 0) {
        // Take the last date before Item Description (most likely service date)
        const dateMatch = allDateMatches[allDateMatches.length - 1];

        if (dateMatch) {
          const month = dateMatch[1].padStart(2, "0");
          const day = dateMatch[2].padStart(2, "0");
          const year = dateMatch[3];
          extracted.dateReceived = `${year}-${month}-${day}`;
        }
      }
    }

    // Customer Name - try multiple patterns
    let customerName: string | undefined;

    // Pattern 1: "Attention" label (standard invoice format)
    const attentionMatch = text.match(/Attention\s+([^\n\r]+?)(?:\n|Email|$)/i);
    if (attentionMatch) {
      customerName = attentionMatch[1].trim();
    }

    // Pattern 2: George's Music form format - look for customer name after "CUSTOMER INFORMATION" section
    // The name appears after a thick black bar/section divider
    if (!customerName) {
      const customerInfoMatch = text.match(/(?:CUSTOMER\s+INFORMATION|Service\s+Location)[^\n]*\n\s*([A-Z][a-zA-Z\s]+?)(?:\n|Address|Street)/i);
      if (customerInfoMatch) {
        customerName = customerInfoMatch[1].trim();
      }
    }

    // Pattern 3: Look for name before address (common in repair forms)
    if (!customerName) {
      const lines = text.split("\n");
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();
        const nextLine = lines[i + 1].trim();
        // If current line looks like a name and next line looks like an address
        if (/^[A-Z][a-zA-Z\s]{3,30}$/.test(line) && /^\d+\s+[A-Z]/.test(nextLine)) {
          customerName = line;
          break;
        }
      }
    }

    if (customerName) {
      extracted.customerName = customerName;
    }

    // Email - look for email address anywhere in the text
    const emailMatch = text.match(
      /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
    );
    if (emailMatch) {
      extracted.customerEmail = emailMatch[1].trim();
    }

    // Phone Number - look for various phone labels
    let phone: string | undefined;

    // Pattern 1: "Phone-Primary" or "Phone" label followed by number
    const primaryPhoneMatch = text.match(/Phone[-\s]*Primary[\s:]*(\d{10,})/i);
    if (primaryPhoneMatch) {
      phone = primaryPhoneMatch[1];
    }

    // Pattern 2: "Phone" or "Number" label
    if (!phone) {
      const phoneMatch = text.match(/(?:Phone|Number)\s*[:\s]*(\d{3}[-.]?\d{3}[-.]?\d{4})/i);
      if (phoneMatch) {
        phone = phoneMatch[1];
      }
    }

    // Pattern 3: Standalone 10-digit number (as fallback)
    if (!phone) {
      const numberMatch = text.match(/(?:^|\n)(\d{3}[-.]?\d{3}[-.]?\d{4})/);
      if (numberMatch) {
        phone = numberMatch[1];
      }
    }

    if (phone) {
      // Format as (XXX) XXX-XXXX if not already formatted
      const cleanPhone = phone.replace(/[-.\s]/g, "");
      if (cleanPhone.match(/^\d{10}$/)) {
        phone = `(${cleanPhone.slice(0, 3)}) ${cleanPhone.slice(3, 6)}-${cleanPhone.slice(6)}`;
      }
      extracted.customerPhone = phone;
    }

    // Address - with full sweep logic
    const address = extractAddressFromText(text);
    if (address) {
      extracted.customerAddress = address;
    }

    // Repair Description - extract from "Trouble Reported" box
    let repairDescription: string | undefined;

    // Find the "Trouble Reported:" label and extract the multi-line text that follows it
    // The pattern should capture text until we hit "Special Instructions" or "Technician Comments"
    const troubleMatch = text.match(/Trouble\s+Reported\s*:?\s*([^]*?)(?=Special\s+Instructions|Technician\s+Comments|Item\s+is\s+being|$)/i);

    if (troubleMatch) {
      let troubleText = troubleMatch[1].trim();

      // Remove leading/trailing punctuation and special characters
      troubleText = troubleText.replace(/^[;:|\/\s]+/, "").replace(/[;:|\/\s]+$/, "").trim();

      // Filter out lines that are just separators or labels
      const lines = troubleText
        .split("\n")
        .map(line => line.trim())
        .filter(line => {
          // Remove empty lines, separator lines, and lines that are just numbers/dashes
          if (!line || /^-+$/.test(line) || /^[0-9]+$/.test(line)) return false;
          // Remove lines that look like form labels or UI elements
          if (/Service|Return|RETURN|ORDER|George|Music/i.test(line)) return false;
          return true;
        });

      if (lines.length > 0) {
        troubleText = lines.join(" ");

        // Clean up the joined text - remove extra spaces and fix common OCR issues
        troubleText = troubleText
          .replace(/\s+/g, " ") // normalize whitespace
          .replace(/\s([.,;!?])/g, "$1") // remove space before punctuation
          .trim();

        if (troubleText.length > 5) {
          repairDescription = troubleText;
        }
      }
    }

    // Pattern 2: "Service" label (standard invoice format) - fallback
    if (!repairDescription) {
      const serviceMatch = text.match(/Service\s+([^\n\r]+?)(?:\n|Invoice|$)/i);
      if (serviceMatch) {
        repairDescription = serviceMatch[1].trim();
      }
    }

    if (repairDescription) {
      extracted.repairDescription = repairDescription;
    }

    // For George's Music forms, we typically don't extract materials/services from the table
    // The form shows empty service rows with just "$0.00", which we should skip
    // Only extract if there are clearly meaningful line items with descriptions and amounts

    const materials: Array<{
      description: string;
      quantity: number;
      unitCost: number;
    }> = [];

    // Skip materials extraction for now for George's Music forms
    // These forms usually have empty service rows that shouldn't be extracted
    // If needed, add explicit extraction logic here in the future

    // Don't set extracted.materials - leave it undefined so form starts empty

    // Extract instrument details
    let instrumentType = "Guitar";
    let instrumentDescription = "";

    // Pattern 1: Look for "Item Description" field (George's Music forms)
    // This should capture the full description like "Fernandes Ravelle deluxe"
    const itemDescMatch = text.match(/Item\s+Description[\s:]*([^\n]+?)(?:\nQty|Quantity|SKU|Serial|$)/i);
    if (itemDescMatch) {
      let desc = itemDescMatch[1].trim();

      // Clean up: remove trailing dashes or extra spaces
      desc = desc.replace(/\s*-+\s*$/, "").trim();

      if (desc.length > 0) {
        instrumentDescription = desc;
      }

      // Also try to extract serial number and append if found
      const serialMatch = text.match(/Serial\s*#[\s:]*([A-Z0-9]+)/i);
      if (serialMatch && instrumentDescription.length < 80) {
        instrumentDescription += " (Serial: " + serialMatch[1] + ")";
      }
    }

    // Pattern 2: Extract instrument type from instrument description or repair description
    const fullText = (instrumentDescription + " " + (extracted.repairDescription || "")).toLowerCase();

    if (fullText.includes("guitar")) instrumentType = "Guitar";
    else if (fullText.includes("bass")) instrumentType = "Bass";
    else if (fullText.includes("violin")) instrumentType = "Violin";
    else if (fullText.includes("cello")) instrumentType = "Cello";
    else if (fullText.includes("fernandes") || fullText.includes("ravelle")) instrumentType = "Guitar";
    else if (fullText.includes("setup")) instrumentType = "Guitar";
    else instrumentType = "Guitar";

    // Use instrument description from form, or repair description as fallback
    const finalInstrumentDesc = instrumentDescription || extracted.repairDescription || "Repair";

    if (finalInstrumentDesc) {
      extracted.instruments = [
        { type: instrumentType, description: finalInstrumentDesc },
      ];
    }

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
