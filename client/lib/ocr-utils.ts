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

    // Use tesseract to recognize text; provide simple logger
    const { data } = await Tesseract.recognize(dataUrl, 'eng', {
      logger: m => {
        // optional: can forward progress to UI
        // console.log('Tesseract', m);
      }
    });

    const text = data?.text || '';

    const extracted: ExtractedInvoiceData = {};

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
