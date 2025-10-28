import Tesseract from 'tesseract.js';

export interface ExtractedInvoiceData {
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  instrumentType?: string;
  instrumentDescription?: string;
  repairDescription?: string;
  materials?: Array<{ description: string; quantity: number; unitCost: number }>;
  laborHours?: number;
  hourlyRate?: number;
}

export const extractInvoiceData = async (imageFile: File): Promise<ExtractedInvoiceData> => {
  try {
    const { data } = await Tesseract.recognize(imageFile, 'eng');
    const text = data.text;

    const extracted: ExtractedInvoiceData = {};

    // Extract customer name (look for "Attention:" field)
    const attentionMatch = text.match(/Attention\s*:?\s*([^\n]+)/i);
    if (attentionMatch) {
      extracted.customerName = attentionMatch[1].trim();
    }

    // Extract phone number (look for patterns like 610.505.6096 or (555) 123-4567)
    const phoneMatch = text.match(/(?:\+?1[-.\s]?)?\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})/);
    if (phoneMatch) {
      extracted.customerPhone = `(${phoneMatch[1]}) ${phoneMatch[2]}-${phoneMatch[3]}`;
    }

    // Extract email
    const emailMatch = text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
    if (emailMatch) {
      extracted.customerEmail = emailMatch[1];
    }

    // Extract service/repair description (look for "Service:" field)
    const serviceMatch = text.match(/Service\s*:?\s*([^\n]+)/i);
    if (serviceMatch) {
      extracted.repairDescription = serviceMatch[1].trim();
    }

    // Extract materials from table
    const materials: Array<{ description: string; quantity: number; unitCost: number }> = [];
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Look for lines with Description, Quantity, and Cost patterns
      if (line.match(/\d+\s+\d+(\.\d{2})?/)) {
        const parts = line.split(/\s+/);
        
        // Try to identify cost and quantity
        let cost = 0;
        let qty = 1;
        let description = line;

        // Extract numbers that look like cost (with decimals)
        const costMatch = line.match(/(\d+\.\d{2})/);
        if (costMatch) {
          cost = parseFloat(costMatch[1]);
          description = line.replace(costMatch[0], '').trim();
        }

        // Extract quantity
        const qtyMatch = line.match(/\s(\d+)\s/);
        if (qtyMatch) {
          qty = parseInt(qtyMatch[1]);
        }

        if (description.trim() && description.length > 3 && cost > 0) {
          materials.push({
            description: description.replace(/\d+(\.\d{2})?/g, '').trim(),
            quantity: qty,
            unitCost: cost,
          });
        }
      }
    }

    if (materials.length > 0) {
      extracted.materials = materials;
    }

    // Default instrument type if not found
    if (!extracted.instrumentType && extracted.repairDescription) {
      if (extracted.repairDescription.toLowerCase().includes('guitar')) {
        extracted.instrumentType = 'Guitar';
      } else if (extracted.repairDescription.toLowerCase().includes('amplifier')) {
        extracted.instrumentType = 'Other';
      }
    }

    return extracted;
  } catch (error) {
    console.error('OCR Error:', error);
    throw new Error('Failed to extract invoice data. Please check the image quality and try again.');
  }
};
