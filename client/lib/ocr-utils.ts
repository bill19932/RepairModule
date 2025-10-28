import Tesseract from 'tesseract.js';

export interface ExtractedInvoiceData {
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
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

export const extractInvoiceData = async (imageFile: File): Promise<ExtractedInvoiceData> => {
  try {
    // Convert file to data URL to ensure tesseract can read it in all environments
    const dataUrl = await readFileAsDataURL(imageFile);

    // Ensure the dataUrl is a loadable image, draw to canvas to normalize format/size
    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = (e) => reject(new Error('Image failed to load'));
      img.src = dataUrl;
    });

    // draw to canvas to normalize and avoid tesseract reading issues
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

    // Use tesseract to recognize text; provide simple logger
    let ocrResult;
    try {
      ocrResult = await Tesseract.recognize(normalizedDataUrl, 'eng', {
        logger: m => {
          // optional: can forward progress to UI
        }
      });
    } catch (err) {
      console.error('Tesseract failed:', err);
      throw err;
    }

    const data = ocrResult?.data || {};
    const text = data?.text || '';

    const extracted: ExtractedInvoiceData = {};

    // Enhanced parsing: invoice number, name, phone, email, address, description, items
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    // Invoice number
    const invMatch = text.match(/Invoice\s*(?:#|Number)?\s*[:#]?\s*(\d{3,10})/i) || text.match(/\bInvoice\s*#?\s*(\d{3,10})\b/i);
    if (invMatch) (extracted as any).invoiceNumber = invMatch[1];

    // Name
    const nameMatch = text.match(/(?:Attention|Bill To|To:)\s*[:\-]?\s*([^\n\r]+)/i);
    if (nameMatch) extracted.customerName = nameMatch[1].trim();

    // Phone
    const phoneMatch = text.match(/(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/);
    if (phoneMatch) extracted.customerPhone = `(${phoneMatch[1]}) ${phoneMatch[2]}-${phoneMatch[3]}`;

    // Email
    const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (emailMatch) extracted.customerEmail = emailMatch[1];

    // Address
    const addrRegex = /\d{1,5}\s+[\w\d\.\-\s]{2,80}\b(?:St|St\.|Street|Ave|Avenue|Rd|Road|Blvd|Lane|Ln|Way|Drive|Dr|Court|Ct|Unit|Suite|Ste|Apt)\b[\w\s,]*/i;
    const addrMatch = text.match(addrRegex);
    if (addrMatch) extracted.customerAddress = addrMatch[0].trim();

    // Find table header index for items
    const headerIndex = lines.findIndex(l => /Description\s+Quantity\s+Unit Cost|Description\s+Qty|Quantity\s+Unit Cost|Unit Cost\s+Cost/i.test(l));

    // Try to detect a long description above the table
    let possibleDesc = '';
    if (headerIndex > 0) {
      for (let i = 0; i < headerIndex; i++) {
        if (lines[i].length > 60) { possibleDesc = lines[i]; break; }
      }
    }
    if (!possibleDesc) {
      const longLine = lines.find(l => l.length > 60);
      if (longLine) possibleDesc = longLine;
    }
    if (possibleDesc) extracted.repairDescription = possibleDesc;

    // Parse materials/items
    const materials: Array<{ description: string; quantity: number; unitCost: number }> = [];
    if (headerIndex >= 0) {
      for (let i = headerIndex + 1; i < lines.length; i++) {
        const line = lines[i];
        if (/subtotal|total|tax/i.test(line)) break;
        const cols = line.split(/\s{2,}/).map(c => c.trim()).filter(Boolean);
        if (cols.length >= 3) {
          const desc = cols[0];
          const qty = parseFloat(cols[1]) || 1;
          let unitCost = parseFloat(cols[2].replace(/[^0-9\.]/g, '')) || 0;
          if (cols.length >= 4) unitCost = parseFloat(cols[3].replace(/[^0-9\.]/g, '')) || unitCost;
          if (desc && unitCost > 0) materials.push({ description: desc, quantity: qty, unitCost });
        } else {
          const costMatch = line.match(/(\d{1,3}(?:,\d{3})*(?:\.\d{2}))/);
          if (costMatch) {
            const cost = parseFloat(costMatch[1].replace(/,/g, ''));
            const qtyMatch = line.match(/\b(\d+)\b/);
            const qty = qtyMatch ? parseInt(qtyMatch[1]) : 1;
            const description = line.replace(costMatch[0], '').trim();
            if (description && cost > 0) materials.push({ description, quantity: qty, unitCost: cost });
          }
        }
      }
    } else {
      for (const line of lines) {
        const costMatch = line.match(/(\d{1,3}(?:,\d{3})*(?:\.\d{2}))/);
        if (costMatch) {
          const cost = parseFloat(costMatch[1].replace(/,/g, ''));
          const qtyMatch = line.match(/\b(\d+)\b/);
          const qty = qtyMatch ? parseInt(qtyMatch[1]) : 1;
          const description = line.replace(costMatch[0], '').trim();
          if (description && cost > 0) materials.push({ description, quantity: qty, unitCost: cost });
        }
      }
    }

    if (materials.length) extracted.materials = materials;

    // Infer instrument type
    if (!extracted.instruments) {
      if (extracted.repairDescription) {
        const d = extracted.repairDescription.toLowerCase();
        if (d.includes('guitar')) extracted.instruments = [{ type: 'Guitar', description: '' }];
        else if (d.includes('bass')) extracted.instruments = [{ type: 'Bass', description: '' }];
        else if (d.includes('violin')) extracted.instruments = [{ type: 'Violin', description: '' }];
      }
    }

    return extracted;

    // Extract customer name (look for "Attention:" or "Bill To" fields)
    const attentionMatch = text.match(/(?:Attention|Bill To|Bill To:)\s*:??\s*([^\n]+)/i) || text.match(/Attention\s*:?\s*([^\n]+)/i);
    if (attentionMatch) {
      extracted.customerName = attentionMatch[1].trim();
    }

    // Extract phone number (look for patterns like 610.505.6096 or (555) 123-4567)
    const phoneMatch = text.match(/(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/);
    if (phoneMatch) {
      extracted.customerPhone = `(${phoneMatch[1]}) ${phoneMatch[2]}-${phoneMatch[3]}`;
    }

    // Extract email
    const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (emailMatch) {
      extracted.customerEmail = emailMatch[1];
    }

    // Extract service/repair description (look for "Service:" or "Description")
    const serviceMatch = text.match(/(?:Service|Description|Work)\s*:??\s*([^\n]+)/i);
    if (serviceMatch) {
      extracted.repairDescription = serviceMatch[1].trim();
    }

    // Extract materials from lines with cost patterns
    const materials: Array<{ description: string; quantity: number; unitCost: number }> = [];
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Look for price-like patterns
      const costMatch = line.match(/(\d{1,3}(?:,\d{3})*(?:\.\d{2}))/);
      if (costMatch) {
        const costStr = costMatch[1].replace(/,/g, '');
        const cost = parseFloat(costStr);

        // try to extract quantity if present nearby
        let qty = 1;
        const qtyMatch = line.match(/\b(\d+)\b/);
        if (qtyMatch) {
          const n = parseInt(qtyMatch[1]);
          if (!isNaN(n) && n > 0 && n < 1000) qty = n;
        }

        // description is line without the cost
        const description = line.replace(costMatch[0], '').replace(/\s{2,}/g, ' ').trim();

        if (description.length > 1 && !isNaN(cost)) {
          materials.push({ description, quantity: qty, unitCost: cost });
        }
      }
    }

    if (materials.length) extracted.materials = materials;

    // Infer instrument from repair description
    let instrumentType = '';
    if (extracted.repairDescription) {
      const d = extracted.repairDescription.toLowerCase();
      if (d.includes('guitar')) instrumentType = 'Guitar';
      else if (d.includes('bass')) instrumentType = 'Bass';
      else if (d.includes('violin')) instrumentType = 'Violin';
      else instrumentType = '';
    }
    if (instrumentType) extracted.instruments = [{ type: instrumentType, description: '' }];

    return extracted;
  } catch (error) {
    console.error('OCR Error:', error);
    throw new Error('Failed to extract invoice data. Please check the image quality and try again.');
  }
};
