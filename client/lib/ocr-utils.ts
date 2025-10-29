import Tesseract from 'tesseract.js';

export interface ExtractedInvoiceData {
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerAddress?: string;
  instruments?: Array<{ type: string; description: string }>;
  repairDescription?: string;
  materials?: Array<{ description: string; quantity: number; unitCost: number }>;
  laborHours?: number;
  hourlyRate?: number;
}

const readFileAsDataURL = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Failed to read file as data URL'));
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// Helper to find address patterns in text
const extractAddressFromText = (text: string): string | undefined => {
  // First try to find address after "Address" label
  const labelMatch = text.match(/Address\s+([^\n\r]+?)(?:\n|Service|$)/i);
  if (labelMatch) {
    return labelMatch[1].trim();
  }

  // Full sweep: Look for standard US address patterns
  // Pattern: number + street name + street type (Ave, St, Rd, etc.) + optional unit/apt + optional city/state
  const addressRegex = /\b(\d{1,5}\s+[\w\s&,.'-]+?\s+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Court|Ct|Place|Pl|Way|Circle|Way|Parkway|Pkwy|Highway|Hwy|Route|Rt|Terrace|Ter|Trail|Trl)\.?)\b[\w\s,#.'-]*(?:(?:Unit|Apt|Apartment|Suite|Ste|Floor|Fl|Bldg|Building)\s*[#A-Za-z0-9]+)?[\w\s,'-]*(?:(?:Wynnewood|Swarthmore|Glennolden|PA|Pennsylvania|01|02|03|04|05|06|07|08|09|10|11|12|13|14|15)[\w\s,'-]*)?/i;

  const streetMatch = text.match(addressRegex);
  if (streetMatch) {
    return streetMatch[0].trim();
  }

  // Alternative: Look for lines with number + words that look like addresses
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    // Look for lines starting with a number followed by text (typical address format)
    if (/^\d{1,5}\s+[A-Z]/.test(trimmed) && trimmed.length > 10 && trimmed.length < 100) {
      // Make sure it's not a table row or other data
      if (!/^\d+\s+\d+\s+\d+/.test(trimmed) && !/Quantity|Cost|Price|Description/i.test(trimmed)) {
        return trimmed;
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
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^\d{5}$/.test(trimmed)) {
      // This could be an invoice number
      return trimmed;
    }
  }

  return undefined;
};

export const extractInvoiceData = async (imageFile: File): Promise<ExtractedInvoiceData> => {
  try {
    const dataUrl = await readFileAsDataURL(imageFile);

    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve();
      img.onerror = (e) => {
        console.error('Image load failed. File size:', imageFile.size, 'Type:', imageFile.type);
        reject(new Error('Image failed to load - file may be corrupted or invalid format'));
      };
      img.src = dataUrl;
    });

    const normalizedDataUrl = await new Promise<string>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const maxW = 2000;
        let w = img.width;
        let h = img.height;
        if (w > maxW) {
          const ratio = maxW / w;
          w = maxW;
          h = Math.round(h * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = dataUrl;
    });

    let ocrResult;
    try {
      ocrResult = await Tesseract.recognize(normalizedDataUrl, 'eng', {
        logger: () => {}
      });
    } catch (err) {
      console.error('Tesseract failed:', err);
      throw err;
    }

    const text = ocrResult?.data?.text || '';
    const extracted: ExtractedInvoiceData = {};

    // Invoice Number - with full sweep logic
    const invoiceNum = extractInvoiceNumber(text);
    if (invoiceNum) {
      (extracted as any).invoiceNumber = invoiceNum;
    }

    // Attention (Customer Name)
    const attentionMatch = text.match(/Attention\s+([^\n\r]+?)(?:\n|Email|$)/i);
    if (attentionMatch) {
      extracted.customerName = attentionMatch[1].trim();
    }

    // Email
    const emailMatch = text.match(/Email\s+([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
    if (emailMatch) {
      extracted.customerEmail = emailMatch[1].trim();
    }

    // Phone Number - look for "Number" label followed by digits
    const phoneMatch = text.match(/Number\s+(\d{10,})/i) || 
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

    // Service Description - look for "Service" label followed by value
    const serviceMatch = text.match(/Service\s+([^\n\r]+?)(?:\n|Invoice|$)/i);
    if (serviceMatch) {
      extracted.repairDescription = serviceMatch[1].trim();
    }

    // Parse work items table
    // Look for "Description" header which marks the start of the items table
    const descHeaderIndex = text.indexOf('Description');
    const materials: Array<{ description: string; quantity: number; unitCost: number }> = [];

    if (descHeaderIndex !== -1) {
      // Extract text from after "Description" header until we hit summary lines (Subtotal, Tax, Total)
      const tableText = text.substring(descHeaderIndex);
      const summaryStart = tableText.search(/Subtotal|Materials|George/i);
      const tableContent = summaryStart > 0 ? tableText.substring(0, summaryStart) : tableText;

      // Split by newlines and process each potential line
      const lines = tableContent.split('\n').map(l => l.trim()).filter(Boolean);

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
        const quantityMatch = line.match(/\b(\d+)\s+(\d+(?:\.\d{2})?)\s+(\d+(?:\.\d{2})?)\s*$/);

        if (costMatch) {
          // This line has a cost at the end
          const cost = parseFloat(costMatch[1]);

          if (quantityMatch) {
            // Has quantity, unit cost, and total cost
            const qty = parseFloat(quantityMatch[1]);
            const unitCost = parseFloat(quantityMatch[2]);
            const description = line.replace(quantityMatch[0], '').trim();

            if (description && description.length > 2 && unitCost > 0) {
              materials.push({ description, quantity: qty, unitCost });
            }
          } else {
            // Just has a cost, try to infer from line structure
            const description = line.replace(costMatch[0], '').trim();
            
            // Try to find quantity in the description
            const qtyInDesc = description.match(/\s(\d+)\s+(\d+(?:\.\d{2})?)\s*$/);
            if (qtyInDesc) {
              const qty = parseFloat(qtyInDesc[1]);
              const unitCost = parseFloat(qtyInDesc[2]);
              const cleanDesc = description.replace(qtyInDesc[0], '').trim();
              if (cleanDesc && cleanDesc.length > 2) {
                materials.push({ description: cleanDesc, quantity: qty, unitCost });
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

    // Infer instrument from repair description
    if (extracted.repairDescription) {
      const d = extracted.repairDescription.toLowerCase();
      let instrumentType = '';
      
      if (d.includes('guitar')) instrumentType = 'Guitar';
      else if (d.includes('bass')) instrumentType = 'Bass';
      else if (d.includes('violin')) instrumentType = 'Violin';
      else if (d.includes('cello')) instrumentType = 'Cello';
      else if (d.includes('setup')) instrumentType = 'Guitar';
      else instrumentType = 'Guitar';

      if (instrumentType) {
        extracted.instruments = [{ type: instrumentType, description: extracted.repairDescription }];
      }
    }

    return extracted;
  } catch (error) {
    console.error('OCR Error:', error);
    throw new Error('Failed to extract invoice data. Please check the image quality and try again.');
  }
};
