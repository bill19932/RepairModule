import { RepairInvoice } from './invoice-types';

export const generateInvoicePDF = (invoice: RepairInvoice): string => {
  const servicesTotal = invoice.materials.reduce((sum, mat) => sum + (mat.quantity * mat.unitCost), 0);
  const subtotal = servicesTotal;
  const tax = subtotal * 0.06;
  const dmcTotal = subtotal;
  const customerTotal = subtotal + tax;

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
    
    .container {
      max-width: 850px;
      margin: 0 auto;
      background: white;
    }
    
    .header-bar {
      background: linear-gradient(to right, #0066cc 0%, #0066cc 100%);
      height: 8px;
      margin-bottom: 20px;
    }
    
    .header-section {
      display: flex;
      justify-content: space-between;
      margin-bottom: 30px;
    }
    
    .logo-section {
      flex: 1;
    }
    
    .logo-box {
      display: inline-block;
      background: #f0f0f0;
      padding: 15px;
      border-radius: 4px;
      margin-bottom: 10px;
    }
    
    .logo-box div {
      font-size: 10px;
      font-weight: bold;
      color: #0066cc;
      text-align: center;
      line-height: 1.2;
    }
    
    .invoice-label {
      font-size: 18px;
      font-weight: bold;
      color: #333;
      margin-bottom: 8px;
    }
    
    .contact-info {
      font-size: 12px;
      color: #0066cc;
      margin-bottom: 2px;
    }
    
    .services {
      font-size: 11px;
      color: #666;
      margin-top: 10px;
      line-height: 1.4;
    }
    
    .invoice-number {
      text-align: right;
      font-size: 12px;
    }
    
    .invoice-number div {
      margin-bottom: 5px;
    }
    
    .info-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
      border: 1px solid #333;
    }
    
    .info-table th {
      background: #f0f0f0;
      padding: 8px;
      text-align: left;
      font-weight: bold;
      font-size: 12px;
      border: 1px solid #333;
    }
    
    .info-table td {
      padding: 8px;
      font-size: 12px;
      border: 1px solid #333;
    }
    
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    
    .items-table th {
      background: #0066cc;
      color: white;
      padding: 10px;
      text-align: left;
      font-weight: bold;
      font-size: 12px;
      border: none;
    }
    
    .items-table td {
      padding: 8px 10px;
      font-size: 11px;
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
      width: 100%;
    }
    
    .totals-row {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      font-size: 12px;
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
      font-size: 11px;
      color: #333;
      text-align: center;
      margin-top: 30px;
      line-height: 1.5;
    }
    
    .footer-message .highlight {
      font-weight: bold;
    }
    
    .thank-you {
      text-align: center;
      font-weight: bold;
      font-size: 13px;
      margin-top: 20px;
    }
    
    .notes-section {
      background: #f9f9f9;
      padding: 10px;
      margin-top: 15px;
      border-left: 3px solid #0066cc;
      font-size: 11px;
    }

    @media print {
      body {
        padding: 0;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header-bar"></div>
    
    <div class="header-section">
      <div class="logo-section">
        <div class="logo-box">
          <div style="font-size: 14px; letter-spacing: 2px;">DELCO</div>
          <div style="font-size: 14px; letter-spacing: 2px;">MUSIC</div>
          <div style="font-size: 10px; color: #999;">COMPANY</div>
        </div>
        <div class="invoice-label">INVOICE</div>
        <div class="contact-info">Bill@delcomusicco.com</div>
        <div class="contact-info">610.505.6096</div>
        <div class="services">
          <div>Private Lessons</div>
          <div>Instrument Repairs</div>
          <div>Recording Services</div>
        </div>
      </div>
      <div class="invoice-number">
        <div><strong>Invoice #</strong></div>
        <div style="font-size: 14px; font-weight: bold;">${invoice.invoiceNumber}</div>
        <div style="margin-top: 10px; font-size: 11px;">Date: ${new Date(invoice.date).toLocaleDateString('en-US')}</div>
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
        <th>Service</th>
        <td>${invoice.repairDescription.substring(0, 40)}${invoice.repairDescription.length > 40 ? '...' : ''}</td>
      </tr>
      <tr>
        <th>Address</th>
        <td colspan="3">${invoice.instrumentDescription || 'N/A'}</td>
      </tr>
    </table>
    
    <table class="items-table">
      <thead>
        <tr>
          <th style="width: 50%;">Description</th>
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
            <td style="text-align: right;">$${(material.quantity * material.unitCost).toFixed(2)}</td>
          </tr>
        `).join('')}
        <tr>
          <td colspan="2" style="text-align: left; font-size: 10px; border-top: 1px solid #ddd;">
            ${invoice.laborHours > 0 ? `Labor: ${invoice.laborHours} hrs @ $${invoice.hourlyRate}/hr` : ''}
          </td>
          <td style="text-align: right; border-top: 1px solid #ddd;"></td>
          <td style="text-align: right; border-top: 1px solid #ddd; font-weight: bold;">$${laborTotal.toFixed(2)}</td>
        </tr>
      </tbody>
    </table>
    
    <div class="totals-section">
      <div class="totals-row subtotal">
        <span>Subtotal</span>
        <span>$${subtotal.toFixed(2)}</span>
      </div>
      <div class="totals-row">
        <span>6% Tax</span>
        <span>$${tax.toFixed(2)}</span>
      </div>
      <div class="totals-row total">
        <span>DMC Total</span>
        <span>$${dmcTotal.toFixed(2)}</span>
      </div>
      <div class="totals-row total" style="border-top: none;">
        <span>Customer Total</span>
        <span>$${customerTotal.toFixed(2)}</span>
      </div>
    </div>
    
    ${invoice.notes ? `
      <div class="notes-section">
        <strong>Notes:</strong><br>
        ${invoice.notes.split('\n').join('<br>')}
      </div>
    ` : ''}
    
    <div class="footer-message">
      <p>Thank you for your business! If you have a few minutes, a <span class="highlight">Google Review</span></p>
      <p>would be greatly appreciated and helps get our business out to more people!</p>
      <p style="margin-top: 10px;">Sincerely yours,</p>
      <p style="font-size: 14px; margin-top: 5px;"><strong>Delco Music Co.</strong></p>
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
