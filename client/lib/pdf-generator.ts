import { RepairInvoice } from './invoice-types';

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

  const logoUrl = 'https://cdn.builder.io/api/v1/image/assets%2F99d159038b9d45ab8f72730367c1abf4%2F9753a3ec93ee4d5dba7a86a75c0f457f?format=webp&width=800';
  const qrGoogle = 'https://cdn.builder.io/api/v1/image/assets%2F99d159038b9d45ab8f72730367c1abf4%2F16d28bb1a7c144dca4fe83ccf654b8bf?format=webp&width=800';
  const qrFacebook = 'https://cdn.builder.io/api/v1/image/assets%2F99d159038b9d45ab8f72730367c1abf4%2F3957d5a2405340f381789e3736f4ae23?format=webp&width=800';
  const qrWebsite = 'https://cdn.builder.io/api/v1/image/assets%2F99d159038b9d45ab8f72730367c1abf4%2F3dab77482ef04753a6e15fd4bed20dac?format=webp&width=800';

  const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    @page { size: 8.5in 11in; margin: 0.5in; }
    html,body { height: 100%; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial;
      color: #222;
      background: white;
      padding: 0;
      margin: 0;
    }
    .page {
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      padding: 18px 28px;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      gap: 12px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .brand img.logo {
      height: 60px;
      width: auto;
      object-fit: contain;
    }
    .brand .title {
      color: #0066cc;
      font-weight: 700;
      font-size: 20px;
      letter-spacing: 1px;
    }
    .meta {
      margin-left: auto;
      text-align: right;
      font-size: 12px;
    }
    .info {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      font-size: 12px;
    }
    .info .left, .info .right { display: block; }
    .info .label { font-weight: 700; color: #444; font-size: 11px; margin-bottom: 4px; }
    .info .value { color: #111; }

    .items {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      margin-top: 6px;
    }
    .items th {
      background: #0066cc;
      color: white;
      padding: 8px 10px;
      text-align: left;
      font-size: 12px;
    }
    .items td {
      padding: 8px 10px;
      border-bottom: 1px solid #e6e6e6;
    }
    .totals {
      margin-top: 8px;
      display: flex;
      justify-content: flex-end;
      gap: 12px;
    }
    .totals .block { width: 260px; }
    .totals .row { display:flex; justify-content:space-between; padding:6px 0; font-size:13px; }
    .totals .row.total { font-weight:700; font-size:15px; border-top:1px solid #ddd; padding-top:10px; }

    .notes { margin-top: 10px; font-size:12px; background:#f6f9ff; padding:8px; border-left:4px solid #0066cc; }

    .footer {
      margin-top: auto;
      display:flex;
      justify-content:space-between;
      align-items:center;
      gap:12px;
      padding-top:12px;
      border-top:1px solid #eee;
    }
    .qr-grid { display:flex; gap:12px; align-items:center; }
    .qr-grid img { width:68px; height:68px; object-fit:cover; border:1px solid #eee; background:white; }
    .footer .msg { font-size:11px; color:#444; text-align:left; }

    /* ensure it prints nicely */
    @media print {
      body { -webkit-print-color-adjust: exact; }
      .page { padding: 12px 18px; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="brand">
      <img class="logo" src="${logoUrl}" alt="Delco Music Co logo" />
      <div>
        <div class="title">Delco Music Co</div>
        <div style="font-size:11px;color:#666;margin-top:4px;">Repair Invoice</div>
      </div>
      <div class="meta">
        <div style="font-weight:700; color:#0066cc; font-size:16px;">${invoice.invoiceNumber}</div>
        <div style="margin-top:6px;">${new Date(invoice.date).toLocaleDateString('en-US')}</div>
      </div>
    </div>

    <div class="info">
      <div class="left">
        <div class="label">Attention</div>
        <div class="value">${invoice.customerName}</div>
        <div style="height:8px"></div>
        <div class="label">Phone</div>
        <div class="value">${invoice.customerPhone || '—'}</div>
        <div style="height:8px"></div>
        <div class="label">Email</div>
        <div class="value">${invoice.customerEmail || '—'}</div>
      </div>
      <div class="right">
        <div class="label">Date Received</div>
        <div class="value">${new Date(invoice.dateReceived).toLocaleDateString('en-US')}</div>
        <div style="height:8px"></div>
        <div class="label">Instruments</div>
        <div class="value">${invoice.instruments.map(i => `${i.type}${i.description ? ' (Instrument Model: ' + i.description + ')' : ''}`).join(', ')}</div>
        <div style="height:8px"></div>
        <div class="label">Repair Work</div>
        <div class="value">${invoice.repairDescription}</div>
      </div>
    </div>

    <table class="items" role="table">
      <thead>
        <tr>
          <th style="width:58%">Service or Material</th>
          <th style="width:12%">Qty</th>
          <th style="width:15%; text-align:right">Unit</th>
          <th style="width:15%; text-align:right">Cost</th>
        </tr>
      </thead>
      <tbody>
        ${invoice.materials.map(m => `
          <tr>
            <td>${m.description}</td>
            <td>${m.quantity}</td>
            <td style="text-align:right">$${m.unitCost.toFixed(2)}</td>
            <td style="text-align:right">$${(m.quantity * m.unitCost).toFixed(2)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="totals">
      <div class="block">
        <div class="row"><div>Services Total</div><div>$${(invoice.materials.reduce((s, m) => s + m.quantity * m.unitCost, 0)).toFixed(2)}</div></div>
        <div class="row"><div>Subtotal</div><div>$${finalSubtotal.toFixed(2)}</div></div>
        <div class="row"><div>6% Tax</div><div>$${finalTax.toFixed(2)}</div></div>
        <div class="row total"><div>Customer Total</div><div>$${finalTotal.toFixed(2)}</div></div>
      </div>
    </div>

    ${invoice.notes ? `<div class="notes"><strong>Notes:</strong><div style="margin-top:6px">${invoice.notes.split('\n').join('<br>')}</div></div>` : ''}

    <div class="footer">
      <div class="qr-grid">
        <img src="${qrGoogle}" alt="Google QR" />
        <img src="${qrFacebook}" alt="Facebook QR" />
        <img src="${qrWebsite}" alt="Website QR" />
      </div>
      <div class="msg">
        <div style="font-weight:700; color:#0066cc;">Thank you for your business!</div>
        <div style="font-size:12px; color:#444; margin-top:6px">Please consider leaving a review — it helps small businesses grow.</div>
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
