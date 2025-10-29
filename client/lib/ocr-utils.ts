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
  // Look for the section that comes AFTER "CUSTOMER INFORMATION" or after customer name

  const lines = text.split("\n");
  let customerSectionStart = -1;

  // Find where the customer information section starts (after thick bar or specific label)
  for (let i = 0; i < lines.length; i++) {
    if (/CUSTOMER\s+INFORMATION/i.test(lines[i])) {
      customerSectionStart = i + 1;
      break;
    }
  }

  // If we found the customer section, only search within that section
  const searchStart = customerSectionStart > 0 ? customerSectionStart : 0;

  // Look for street address in the customer section
  for (let i = searchStart; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Skip if this looks like the store address (contains "Woodland Ave" or similar store indicators)
    if (/Woodland|1025\s+E|George's\s+Music|Springfield/i.test(trimmed)) {
      continue;
    }

    // Look for customer street address: number + street name + optional apt/unit
    if (/^\d{1,5}\s+[\w\s&,.'-]+(?:Lane|Ln|Street|St|Ave|Avenue|Road|Rd|Drive|Dr|Way|Blvd|Boulevard|Court|Ct|Place|Pl)/i.test(trimmed)) {
      let addressParts = [trimmed];
      let nextIdx = i + 1;

      // Look for city on next line (e.g., "Ridley Park")
      if (nextIdx < lines.length) {
        const cityLine = lines[nextIdx].trim();
        // Check if it looks like a city name (one or two words, capitalized, not "Phone" or "Email" etc)
        if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?$/.test(cityLine) && !/Phone|Email|PA|Pennsylvania|Primary|Secondary|Signature/i.test(cityLine)) {
          addressParts.push(cityLine);
          nextIdx++;
        }
      }

      // Look for state/zip on next line
      if (nextIdx < lines.length) {
        const stateZipLine = lines[nextIdx].trim();
        // Extract PA and zip code from this line, but NOT other lines
        const stateMatch = stateZipLine.match(/\bPA\b/i);
        const zipMatch = stateZipLine.match(/\b(\d{5})\b/);

        if (stateMatch && zipMatch) {
          addressParts.push("PA " + zipMatch[1]);
        }
      }

      // Construct full address
      let fullAddress = addressParts.join(", ");

      // Make sure it's not a table row
      if (!/^\d+\s+\d+\s+\d+|Quantity|Cost|Price|Description/i.test(fullAddress)) {
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

    // Date Received - look for the service date in top section of form, before "Trouble Reported"
    // George's forms have the service date early in the form, near the item description section
    // Extract the date that appears before "Trouble Reported" section

    // First, find where "Trouble Reported" starts
    const troubleIndex = text.indexOf("Trouble");
    const textBeforeTrouble = troubleIndex > 0 ? text.substring(0, troubleIndex) : text;

    // Find the last date before "Trouble Reported" (this should be the service date)
    const dateMatches = Array.from(textBeforeTrouble.matchAll(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/g));

    if (dateMatches && dateMatches.length > 0) {
      // Use the last date found before "Trouble Reported" (most likely the service date)
      const dateMatch = dateMatches[dateMatches.length - 1];
      if (dateMatch) {
        const month = dateMatch[1].padStart(2, "0");
        const day = dateMatch[2].padStart(2, "0");
        const year = dateMatch[3];
        // Convert to YYYY-MM-DD format for the form
        extracted.dateReceived = `${year}-${month}-${day}`;
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

    // Repair Description - extract from "Trouble Reported" section
    let repairDescription: string | undefined;

    // Find "Trouble Reported" label and extract the text in that box
    const troubleIndex = text.indexOf(/Trouble\s+Reported/i);
    if (troubleIndex !== -1) {
      // Find the colon or end of label
      const labelEndIndex = text.indexOf(":", troubleIndex);
      const contentStartIndex = labelEndIndex !== -1 ? labelEndIndex + 1 : troubleIndex + 15;

      // Find where the next section starts (Special Instructions or Technician Comments)
      const nextSectionMatch = text.substring(contentStartIndex).match(/(?:Special\s+Instructions|Technician\s+Comments|Item\s+is|Service\s+Performed)/i);
      const contentEndIndex = nextSectionMatch ? contentStartIndex + nextSectionMatch.index! : contentStartIndex + 500;

      // Extract the trouble text
      let troubleText = text.substring(contentStartIndex, contentEndIndex).trim();

      // Clean up the text - remove excessive whitespace but preserve the content
      troubleText = troubleText
        .split("\n")
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join(" ");

      // Remove common trailing labels
      troubleText = troubleText.replace(/(?:Special\s+Instructions.*)?$/i, "").trim();

      if (troubleText.length > 5) {
        repairDescription = troubleText;
      }
    }

    // Pattern 2: "Service" label (standard invoice format)
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
    const itemDescMatch = text.match(/Item\s+Description[\s:]*([^\n]*?)(?:\nQty|Quantity|$)/i);
    if (itemDescMatch) {
      instrumentDescription = itemDescMatch[1].trim();

      // Try to extract serial number if present in the same area
      const serialMatch = text.match(/Serial\s*#\s*([A-Z0-9]+)/i);
      if (serialMatch && instrumentDescription.length < 50) {
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
