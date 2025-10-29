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

// Helper to find address patterns in text
const extractAddressFromText = (text: string): string | undefined => {
  // First try to find address after "Address" label
  const labelMatch = text.match(/Address\s+([^\n\r]+?)(?:\n|Service|$)/i);
  if (labelMatch) {
    return labelMatch[1].trim();
  }

  // George's Music forms - look for customer info section and extract address from there
  // Address format: street on one line, city on next, state/zip on another
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Look for street address pattern: number + street name + optional apt/unit
    if (/^\d{1,5}\s+[\w\s&,.'-]+(?:Lane|Ln|Street|St|Ave|Avenue|Road|Rd|Drive|Dr|Way|Blvd|Boulevard|Court|Ct|Place|Pl)/i.test(trimmed)) {
      let addressParts = [trimmed];
      let nextIdx = i + 1;

      // Look for city on next line (e.g., "Ridley Park")
      if (nextIdx < lines.length) {
        const cityLine = lines[nextIdx].trim();
        // Check if it looks like a city name (one or two words, capitalized)
        if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?$/.test(cityLine) && !/Street|Street|Apt|Unit|Apt|Suite|Phone|Email|PA|Pennsylvania/i.test(cityLine)) {
          addressParts.push(cityLine);
          nextIdx++;
        }
      }

      // Look for state/zip - could be on same line or next line(s)
      // Search for PA or a 5-digit zip code
      let stateZip = "";

      // Check if state/zip is on the next unprocessed line
      if (nextIdx < lines.length) {
        const stateZipLine = lines[nextIdx].trim();
        // Look for state and/or zip in this line
        const stateMatch = stateZipLine.match(/\bPA\b/i);
        const zipMatch = stateZipLine.match(/\b\d{5}\b/);

        if (stateMatch && zipMatch) {
          stateZip = "PA " + zipMatch[0];
        } else if (zipMatch) {
          stateZip = zipMatch[0];
        } else if (stateMatch) {
          stateZip = "PA";
        }
      }

      // Also check same line as city for state/zip
      if (!stateZip && addressParts.length > 1) {
        const cityLine = addressParts[addressParts.length - 1];
        const stateMatch = cityLine.match(/\bPA\b/i);
        const zipMatch = cityLine.match(/\b\d{5}\b/);

        if (stateMatch || zipMatch) {
          const stateZipPart = stateMatch ? "PA " : "";
          const zipPart = zipMatch ? zipMatch[0] : "";
          stateZip = (stateZipPart + zipPart).trim();
        }
      }

      if (stateZip) {
        addressParts.push(stateZip);
      }

      // Construct full address
      let fullAddress = addressParts.join(", ");

      // Make sure it's not a table row or other data
      if (!/^\d+\s+\d+\s+\d+|Quantity|Cost|Price|Description/i.test(fullAddress)) {
        return fullAddress;
      }
    }
  }

  return undefined;
};

// Helper to find invoice number
const extractInvoiceNumber = (text: string): string | undefined => {
  // First try "Invoice #" or "Invoice Number" format
  const labelMatch = text.match(/Invoice\s*#\s*(\d+)/i);
  if (labelMatch) {
    return labelMatch[1];
  }

  // Look for patterns like "33740", "33742", "336xx", "337xx", "338xx"
  // These appear as standalone numbers in the 5-digit range
  const numberMatch = text.match(/\bInvoice[^\d]*(\d{5})\b/i);
  if (numberMatch) {
    return numberMatch[1];
  }

  // Fallback: Look for any 5-digit number that appears isolated on its own line
  const lines = text.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^\d{5}$/.test(trimmed)) {
      // This could be an invoice number
      return trimmed;
    }
  }

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

    // Date Received - look for the service date in top section of form (before customer info)
    // George's forms have date at the top in MM/DD/YYYY format
    const dateMatches = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/g);
    if (dateMatches && dateMatches.length > 0) {
      // Use the first date found (usually the service date at top)
      const dateMatch = dateMatches[0].match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
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

    // Email
    const emailMatch = text.match(
      /Email\s+([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
    );
    if (emailMatch) {
      extracted.customerEmail = emailMatch[1].trim();
    }

    // Phone Number - look for "Number" label followed by digits
    const phoneMatch =
      text.match(/Number\s+(\d{10,})/i) ||
      text.match(/(?:^|\n)(\d{3}[-.]?\d{3}[-.]?\d{4})/);
    if (phoneMatch) {
      let phone = phoneMatch[1];
      // Format as (XXX) XXX-XXXX if not already formatted
      if (phone.match(/^\d{10}$/)) {
        phone = `(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}`;
      }
      extracted.customerPhone = phone;
    }

    // Address - with full sweep logic
    const address = extractAddressFromText(text);
    if (address) {
      extracted.customerAddress = address;
    }

    // Repair Description - try multiple patterns
    let repairDescription: string | undefined;

    // Pattern 1: "Trouble Reported" section (George's Music forms)
    const troubleMatch = text.match(/Trouble\s+Reported[\s\n]*([^\n]*?)(?:\nSpecial|Technician|$)/i);
    if (troubleMatch) {
      repairDescription = troubleMatch[1].trim();
    }

    // Pattern 2: Extended "Trouble Reported" section with multiple lines
    if (!repairDescription || repairDescription.length < 10) {
      const troubleExtendedMatch = text.match(/Trouble\s+Reported[\s\n]+([^]*?)(?:\n(?:Special|Service Performed|Technician)|$)/i);
      if (troubleExtendedMatch) {
        let text = troubleExtendedMatch[1].trim();
        // Clean up the text - remove extra line breaks and spaces
        text = text.replace(/\n\s*\n/g, " ").replace(/\s+/g, " ");
        repairDescription = text;
      }
    }

    // Pattern 3: "Service" label (standard invoice format)
    if (!repairDescription) {
      const serviceMatch = text.match(/Service\s+([^\n\r]+?)(?:\n|Invoice|$)/i);
      if (serviceMatch) {
        repairDescription = serviceMatch[1].trim();
      }
    }

    if (repairDescription) {
      extracted.repairDescription = repairDescription;
    }

    // Parse work items table
    // Look for "Description" header which marks the start of the items table
    const descHeaderIndex = text.indexOf("Description");
    const materials: Array<{
      description: string;
      quantity: number;
      unitCost: number;
    }> = [];

    if (descHeaderIndex !== -1) {
      // Extract text from after "Description" header until we hit summary lines (Subtotal, Tax, Total)
      const tableText = text.substring(descHeaderIndex);
      const summaryStart = tableText.search(/Subtotal|Materials|George/i);
      const tableContent =
        summaryStart > 0 ? tableText.substring(0, summaryStart) : tableText;

      // Split by newlines and process each potential line
      const lines = tableContent
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);

      // Skip the "Description", "Quantity", "Unit Cost", "Cost" header lines
      let inItemsSection = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Skip header row and common separator words
        if (/Description|Quantity|Unit Cost|Cost|^-+$/i.test(line)) {
          inItemsSection = true;
          continue;
        }

        if (!inItemsSection) continue;

        // Skip "Materials" and "Delivery Fee" rows as they're handled separately
        if (/^Materials$|^Delivery Fee/i.test(line)) continue;

        // Try to find cost patterns in the line: dollar amounts or numbers
        // Pattern: description text, then numbers for quantity, unit cost, and total
        const costMatch = line.match(/(\d+(?:\.\d{2})?)\s*$/);
        const quantityMatch = line.match(
          /\b(\d+)\s+(\d+(?:\.\d{2})?)\s+(\d+(?:\.\d{2})?)\s*$/,
        );

        if (costMatch) {
          // This line has a cost at the end
          const cost = parseFloat(costMatch[1]);

          if (quantityMatch) {
            // Has quantity, unit cost, and total cost
            const qty = parseFloat(quantityMatch[1]);
            const unitCost = parseFloat(quantityMatch[2]);
            const description = line.replace(quantityMatch[0], "").trim();

            if (description && description.length > 2 && unitCost > 0) {
              materials.push({ description, quantity: qty, unitCost });
            }
          } else {
            // Just has a cost, try to infer from line structure
            const description = line.replace(costMatch[0], "").trim();

            // Try to find quantity in the description
            const qtyInDesc = description.match(
              /\s(\d+)\s+(\d+(?:\.\d{2})?)\s*$/,
            );
            if (qtyInDesc) {
              const qty = parseFloat(qtyInDesc[1]);
              const unitCost = parseFloat(qtyInDesc[2]);
              const cleanDesc = description.replace(qtyInDesc[0], "").trim();
              if (cleanDesc && cleanDesc.length > 2) {
                materials.push({
                  description: cleanDesc,
                  quantity: qty,
                  unitCost,
                });
              }
            } else if (description && description.length > 10) {
              // Long description with just a cost - assume qty 1
              materials.push({ description, quantity: 1, unitCost: cost });
            }
          }
        }
      }
    }

    if (materials.length > 0) {
      extracted.materials = materials;
    }

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
