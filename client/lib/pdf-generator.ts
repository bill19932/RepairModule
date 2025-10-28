import { RepairInvoice } from './invoice-types';

export const generateInvoicePDF = (invoice: RepairInvoice): string => {
  const servicesTotal = invoice.materials.reduce((sum, mat) => sum + (mat.quantity * mat.unitCost), 0);
  const subtotal = servicesTotal;
  const tax = subtotal * 0.06;
  const customerTotal = subtotal + tax;
  const georgesUpcharge = invoice.isGeorgesMusic ? 1.54 : 1;
  const georgesSubtotal = subtotal * georgesUpcharge;
  const georgesTax = georgesSubtotal * 0.06;
  const georgesCustomerTotal = georgesSubtotal + georgesTax;

  const finalTotal = invoice.isGeorgesMusic ? georgesCustomerTotal : customerTotal;
  const finalSubtotal = invoice.isGeorgesMusic ? georgesSubtotal : subtotal;
  const finalTax = invoice.isGeorgesMusic ? georgesTax : tax;

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
      font-family: Arial, sans-serif;
      color: #333;
      background: white;
      padding: 20px;
    }
    
    .invoice-container {
      max-width: 850px;
      margin: 0 auto;
      background: white;
    }
    
    .header-bar {
      background: #0066cc;
      height: 8px;
      margin-bottom: 30px;
    }
    
    .header-section {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 40px;
    }
    
    .company-info {
      flex: 1;
    }
    
    .logo {
      display: inline-block;
      background: #f0f0f0;
      padding: 12px 10px;
      border-radius: 4px;
      margin-bottom: 8px;
      text-align: center;
      border: 2px solid #0066cc;
    }
    
    .logo-text {
      font-size: 9px;
      font-weight: bold;
      color: #0066cc;
      letter-spacing: 1px;
      line-height: 1.2;
    }
    
    .invoice-label {
      font-size: 16px;
      font-weight: bold;
      color: #333;
      margin-bottom: 8px;
    }
    
    .contact-info {
      font-size: 11px;
      color: #0066cc;
      margin: 3px 0;
    }
    
    .services-list {
      font-size: 10px;
      color: #666;
      margin-top: 10px;
      line-height: 1.3;
    }
    
    .invoice-details {
      text-align: right;
      font-size: 11px;
    }
    
    .invoice-details .number {
      font-size: 14px;
      font-weight: bold;
      color: #0066cc;
      margin: 5px 0;
    }
    
    .invoice-details .date {
      font-size: 10px;
      margin-top: 10px;
    }
    
    .info-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 25px;
      border: 1px solid #333;
    }
    
    .info-table th {
      background: #f0f0f0;
      padding: 8px;
      text-align: left;
      font-weight: bold;
      font-size: 11px;
      border: 1px solid #333;
    }
    
    .info-table td {
      padding: 8px;
      font-size: 11px;
      border: 1px solid #333;
    }
    
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 25px;
    }
    
    .items-table th {
      background: #0066cc;
      color: white;
      padding: 10px;
      text-align: left;
      font-weight: bold;
      font-size: 11px;
    }
    
    .items-table td {
      padding: 8px 10px;
      font-size: 10px;
      border-bottom: 1px solid #ddd;
    }
    
    .items-table tr:last-child td {
      border-bottom: 1px solid #333;
    }
    
    .text-right {
      text-align: right;
    }
    
    .totals-section {
      margin-bottom: 30px;
    }
    
    .totals-row {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      font-size: 11px;
      border-bottom: 1px solid #ddd;
    }
    
    .totals-row.subtotal {
      border-bottom: 1px solid #333;
    }
    
    .totals-row.total {
      font-weight: bold;
      border-bottom: 2px solid #333;
      border-top: 1px solid #333;
      padding-top: 8px;
      padding-bottom: 8px;
    }
    
    .footer-message {
      font-size: 10px;
      color: #333;
      text-align: center;
      margin-top: 25px;
      line-height: 1.4;
    }
    
    .thank-you {
      text-align: center;
      font-weight: bold;
      font-size: 12px;
      margin-top: 15px;
    }
    
    .qr-section {
      text-align: center;
      margin-top: 25px;
      font-size: 9px;
    }
    
    .qr-placeholder {
      display: inline-block;
      width: 60px;
      height: 60px;
      margin: 0 15px;
      border: 1px solid #ddd;
      background: #f9f9f9;
      line-height: 60px;
      vertical-align: top;
    }
    
    .notes-section {
      background: #f5f5f5;
      padding: 10px;
      margin-top: 15px;
      border-left: 3px solid #0066cc;
      font-size: 10px;
    }
  </style>
</head>
<body>
  <div class="invoice-container">
    <div class="header-bar"></div>
    
    <div class="header-section">
      <div class="company-info">
        <div class="logo">
          <div class="logo-text">DELCO</div>
          <div class="logo-text">MUSIC</div>
          <div class="logo-text" style="font-size: 8px; color: #999;">COMPANY</div>
        </div>
        <div class="invoice-label">INVOICE</div>
        <div class="contact-info">Bill@delcomusicco.com</div>
        <div class="contact-info">610.505.6096</div>
        <div class="services-list">
          <div>Private Lessons</div>
          <div>Instrument Repairs</div>
          <div>Recording Services</div>
        </div>
      </div>
      <div class="invoice-details">
        <div class="number">${invoice.invoiceNumber}</div>
        <div class="date">${new Date(invoice.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
      </div>
    </div>
    
    <table class="info-table">
      <tr>
        <th style="width: 20%;">Attention</th>
        <td style="width: 30%;">${invoice.customerName}</td>
        <th style="width: 20%;">Email</th>
        <td>${invoice.customerEmail || 'na'}</td>
      </tr>
      <tr>
        <th>Number</th>
        <td>${invoice.customerPhone}</td>
        <th>Date Received</th>
        <td>${new Date(invoice.dateReceived).toLocaleDateString('en-US')}</td>
      </tr>
      <tr>
        <th>Instruments</th>
        <td colspan="3">${invoice.instruments.map(i => `${i.type}${i.description ? ' (Instrument Model: ' + i.description + ')' : ''}`).join(', ')}</td>
      </tr>
    </table>
    
    <table class="items-table">
      <thead>
        <tr>
          <th style="width: 50%;">Service or Material</th>
          <th style="width: 15%; text-align: center;">Quantity</th>
          <th style="width: 15%; text-align: right;">Unit Cost</th>
          <th style="width: 20%; text-align: right;">Cost</th>
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
      </tbody>
    </table>
    
    <div class="totals-section">
      <div class="totals-row subtotal">
        <span>Subtotal</span>
        <span>$${finalSubtotal.toFixed(2)}</span>
      </div>
      <div class="totals-row">
        <span>6% Tax</span>
        <span>$${finalTax.toFixed(2)}</span>
      </div>
      <div class="totals-row total">
        <span>DMC Total</span>
        <span>$${finalSubtotal.toFixed(2)}</span>
      </div>
      <div class="totals-row total" style="border-top: none;">
        <span>Customer Total</span>
        <span>$${finalTotal.toFixed(2)}</span>
      </div>
    </div>
    
    ${invoice.notes ? `
      <div class="notes-section">
        <strong>Notes:</strong><br>
        ${invoice.notes.split('\n').join('<br>')}
      </div>
    ` : ''}
    
    <div class="footer-message">
      <p>Thank you for your business! If you have a few minutes, a <strong>Google Review</strong></p>
      <p>would be greatly appreciated and helps get our business out to more people!</p>
      <p style="margin-top: 10px;">Sincerely yours,</p>
      <p style="font-size: 12px; margin-top: 5px;"><strong>Delco Music Co.</strong></p>
    </div>
    
    <div class="qr-section">
      <div style="margin-top: 15px;">
        <div class="qr-placeholder">[QR]</div>
        <div class="qr-placeholder">[QR]</div>
        <div class="qr-placeholder">[QR]</div>
      </div>
      <div style="margin-top: 8px;">
        <div style="display: inline-block; margin: 0 15px; font-size: 9px;">Google Review</div>
        <div style="display: inline-block; margin: 0 15px; font-size: 9px;">Facebook Review</div>
        <div style="display: inline-block; margin: 0 15px; font-size: 9px;">Our Website</div>
      </div>
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
