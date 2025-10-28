import { RepairInvoice } from './invoice-types';

export const generateInvoicePDF = (invoice: RepairInvoice): string => {
  const materialsTotal = invoice.materials.reduce((sum, mat) => sum + (mat.quantity * mat.unitCost), 0);
  const laborTotal = invoice.laborHours * invoice.hourlyRate;
  const subtotal = materialsTotal + laborTotal;
  const tax = subtotal * 0.08;
  const total = subtotal + tax;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      color: #1a1a1a;
      background: white;
      padding: 40px;
    }
    
    .invoice-container {
      max-width: 800px;
      margin: 0 auto;
      background: white;
    }
    
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 40px;
      border-bottom: 3px solid #e74c3c;
      padding-bottom: 30px;
    }
    
    .company-info h1 {
      font-size: 32px;
      color: #e74c3c;
      margin-bottom: 5px;
      font-weight: 700;
    }
    
    .company-info p {
      color: #666;
      font-size: 14px;
      margin: 2px 0;
    }
    
    .invoice-title {
      text-align: right;
    }
    
    .invoice-title h2 {
      font-size: 28px;
      color: #333;
      margin-bottom: 10px;
    }
    
    .invoice-details {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 40px;
    }
    
    .detail-section {
      background: #f9f9f9;
      padding: 15px;
      border-radius: 8px;
    }
    
    .detail-section h3 {
      font-size: 12px;
      text-transform: uppercase;
      color: #e74c3c;
      margin-bottom: 10px;
      font-weight: 600;
    }
    
    .detail-section p {
      font-size: 14px;
      margin: 4px 0;
      color: #333;
    }
    
    .detail-section .label {
      font-weight: 600;
      color: #666;
    }
    
    .instrument-section {
      grid-column: 1 / -1;
      background: #fff3e0;
      padding: 15px;
      border-radius: 8px;
    }
    
    .instrument-section h3 {
      color: #f39c12;
    }
    
    .instrument-section p {
      font-size: 14px;
      margin: 4px 0;
      color: #333;
    }
    
    .description-section {
      grid-column: 1 / -1;
      background: #e8f5e9;
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 30px;
    }
    
    .description-section h3 {
      color: #27ae60;
    }
    
    .description-section p {
      font-size: 14px;
      color: #333;
      line-height: 1.6;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
    }
    
    table th {
      background: #34495e;
      color: white;
      padding: 12px;
      text-align: left;
      font-weight: 600;
      font-size: 13px;
    }
    
    table td {
      padding: 12px;
      border-bottom: 1px solid #ecf0f1;
      font-size: 14px;
    }
    
    table tr:nth-child(even) {
      background: #f8f9fa;
    }
    
    .text-right {
      text-align: right;
    }
    
    .totals {
      width: 100%;
      margin-bottom: 30px;
    }
    
    .totals-table {
      width: 350px;
      margin-left: auto;
    }
    
    .totals-table td {
      padding: 10px;
      border: none;
      font-size: 14px;
    }
    
    .totals-table td:first-child {
      text-align: left;
      color: #666;
    }
    
    .totals-table td:last-child {
      text-align: right;
      font-weight: 600;
      color: #333;
    }
    
    .totals-table .subtotal-row td:last-child {
      border-bottom: 1px solid #ddd;
      padding-bottom: 15px;
      color: #666;
    }
    
    .totals-table .tax-row td {
      color: #666;
    }
    
    .totals-table .total-row td {
      font-size: 16px;
      font-weight: 700;
      color: #e74c3c;
      border-top: 2px solid #e74c3c;
      padding-top: 15px;
    }
    
    .notes-section {
      background: #f5f5f5;
      padding: 15px;
      border-radius: 8px;
      border-left: 4px solid #2196f3;
    }
    
    .notes-section h3 {
      font-size: 12px;
      text-transform: uppercase;
      color: #2196f3;
      margin-bottom: 8px;
      font-weight: 600;
    }
    
    .notes-section p {
      font-size: 14px;
      color: #333;
      line-height: 1.5;
    }
    
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #ecf0f1;
      text-align: center;
      color: #999;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="invoice-container">
    <div class="header">
      <div class="company-info">
        <h1>🎸 Delco Music Co</h1>
        <p>Professional Musical Instrument Repair</p>
        <p>repair@delcomusic.com</p>
      </div>
      <div class="invoice-title">
        <h2>INVOICE</h2>
        <p style="color: #e74c3c; font-weight: 600;">#${invoice.invoiceNumber}</p>
        <p style="color: #666; margin-top: 8px;">${new Date(invoice.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>
    </div>
    
    <div class="invoice-details">
      <div class="detail-section">
        <h3>Bill To</h3>
        <p class="label">${invoice.customerName}</p>
        <p>${invoice.customerPhone}</p>
        <p>${invoice.customerEmail}</p>
      </div>
      
      <div class="detail-section">
        <h3>Service Date</h3>
        <p>${new Date(invoice.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>
      
      <div class="instrument-section">
        <h3>Instrument Information</h3>
        <p><span class="label">Type:</span> ${invoice.instrumentType}</p>
        <p><span class="label">Description:</span> ${invoice.instrumentDescription}</p>
      </div>
      
      <div class="description-section">
        <h3>Repair Work Description</h3>
        <p>${invoice.repairDescription.split('\n').join('<br>')}</p>
      </div>
    </div>
    
    <table>
      <thead>
        <tr>
          <th>Item Description</th>
          <th style="text-align: center; width: 80px;">Qty</th>
          <th style="text-align: right; width: 100px;">Unit Cost</th>
          <th style="text-align: right; width: 100px;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${invoice.materials.map(material => `
          <tr>
            <td>${material.description}</td>
            <td style="text-align: center;">${material.quantity}</td>
            <td style="text-align: right;">$${material.unitCost.toFixed(2)}</td>
            <td style="text-align: right; font-weight: 600;">$${(material.quantity * material.unitCost).toFixed(2)}</td>
          </tr>
        `).join('')}
        <tr>
          <td colspan="3" style="font-weight: 600; text-align: right;">Labor (${invoice.laborHours} hrs @ $${invoice.hourlyRate}/hr)</td>
          <td style="text-align: right; font-weight: 600;">$${laborTotal.toFixed(2)}</td>
        </tr>
      </tbody>
    </table>
    
    <div class="totals">
      <table class="totals-table">
        <tr class="subtotal-row">
          <td>Subtotal</td>
          <td>$${subtotal.toFixed(2)}</td>
        </tr>
        <tr class="tax-row">
          <td>Tax (8%)</td>
          <td>$${tax.toFixed(2)}</td>
        </tr>
        <tr class="total-row">
          <td>Total Due</td>
          <td>$${total.toFixed(2)}</td>
        </tr>
      </table>
    </div>
    
    ${invoice.notes ? `
      <div class="notes-section">
        <h3>Additional Notes</h3>
        <p>${invoice.notes.split('\n').join('<br>')}</p>
      </div>
    ` : ''}
    
    <div class="footer">
      <p>Thank you for choosing Delco Music Co for your instrument repair needs.</p>
      <p>Generated on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
    </div>
  </div>
</body>
</html>
  `;

  return html;
};

export const downloadInvoicePDF = (invoice: RepairInvoice) => {
  const html = generateInvoicePDF(invoice);
  
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  document.body.appendChild(iframe);
  
  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (iframeDoc) {
    iframeDoc.open();
    iframeDoc.write(html);
    iframeDoc.close();
    
    iframe.onload = () => {
      setTimeout(() => {
        iframe.contentWindow?.print();
      }, 250);
    };
  }
};
