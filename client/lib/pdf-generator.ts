import { RepairInvoice } from './invoice-types';

import { RepairInvoice } from './invoice-types';

export const generateInvoicePDF = (invoice: RepairInvoice): string => {
  const servicesTotal = invoice.materials.reduce((sum, mat) => sum + (mat.quantity * mat.unitCost), 0);
  const subtotal = servicesTotal;
  const delivery = invoice.isGeorgesMusic ? 0 : (invoice.deliveryFee || 0);
  const subtotalWithDelivery = subtotal + delivery;
  const tax = subtotalWithDelivery * 0.06;
  const customerTotal = subtotalWithDelivery + tax;

  // George's: upcharge applied AFTER tax on your charge
  const yourTax = subtotal * 0.06;
  const yourChargeWithTax = subtotal + yourTax;
  const georgesSubtotal = yourChargeWithTax * 1.54;
  const georgesTax = 0;  // Tax already included in the 1.54 multiplier
  const georgesCustomerTotal = georgesSubtotal;

  const finalTotal = invoice.isGeorgesMusic ? georgesCustomerTotal : customerTotal;
  const finalSubtotal = invoice.isGeorgesMusic ? georgesSubtotal : subtotalWithDelivery;
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
    /* Portrait 8.5x11 */
    @page {
      size: 8.5in 11in;
      margin: 0.5in 0.4in 0.5in 0.4in;
      @bottom-center { content: ""; }
      @top-center { content: ""; }
      @top-left { content: ""; }
      @top-right { content: ""; }
      @bottom-left { content: ""; }
      @bottom-right { content: ""; }
    }
    html,body { height: 100%; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial;
      color: #111;
      background: white;
      padding: 0;
      margin: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    .page {
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      padding: 20px 28px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 14px;
      color-adjust: exact;
    }
    .brand {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      text-align: center;
    }
    .brand img.logo {
      height: 68px;
      width: auto;
      object-fit: contain;
    }
    .brand .title {
      color: #0b64b3;
      font-weight: 800;
      font-size: 22px;
      letter-spacing: 1px;
    }
    .brand .subtitle { color: #6b7280; font-size: 12px; }

    .meta { text-align: center; font-size: 12px; color: #374151; }

    .info {
      width: 100%;
      max-width: 760px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      font-size: 12px;
    }
    .info .left, .info .right { display: block; }
    .info .label { font-weight: 700; color: #374151; font-size: 12px; margin-bottom: 6px; }
    .info .value { color: #111; }

    .items {
      width: 100%;
      max-width: 760px;
      border-collapse: collapse;
      font-size: 12px;
      margin-top: 6px;
      box-shadow: 0 1px 0 rgba(0,0,0,0.04);
      border-radius: 6px;
      overflow: hidden;
    }
    .items thead th {
      background: linear-gradient(180deg,#0b64b3,#0a58a5);
      color: white;
      padding: 10px 12px;
      text-align: left;
      font-size: 12px;
      font-weight: 700;
    }
    .items td {
      padding: 10px 12px;
      border-bottom: 1px solid #eef2f7;
      background: white;
    }

    .totals {
      width: 100%;
      max-width: 760px;
      margin-top: 8px;
      display: flex;
      justify-content: flex-end;
    }
    .totals .block { width: 300px; }
    .totals .row { display:flex; justify-content:space-between; padding:8px 0; font-size:13px; }
    .totals .row.total { font-weight:800; font-size:16px; border-top:1px solid #e6eef7; padding-top:10px; }

    .notes { margin-top: 10px; font-size:12px; background:#f8fbff; padding:10px; border-left:4px solid #0b64b3; max-width:760px; }

    .footer {
      width: 100%;
      max-width: 760px;
      margin-top: 18px;
      display:flex;
      flex-direction:column;
      align-items:center;
      gap:12px;
      padding-top:12px;
      border-top:1px solid #f0f4f8;
    }
    .qr-grid { display:flex; gap:26px; align-items:center; justify-content:center; }
    .qr-item { display:flex; flex-direction:column; align-items:center; gap:6px; }
    .qr-grid img { width:86px; height:86px; object-fit:cover; border:1px solid #eee; background:white; padding:6px; border-radius:6px; }
    .qr-label { font-size:11px; color:#374151; font-weight:600; }
    .footer .msg { font-size:13px; color:#374151; text-align:center; line-height:1.4; max-width:560px; }

    /* ensure it prints nicely and colors remain */
    @media print {
      body { -webkit-print-color-adjust: exact; color-adjust: exact; }
      .page { padding: 12px 16px; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="brand">
      <img class="logo" src="${logoUrl}" alt="Delco Music Co logo" />
      <div style="font-size:11px;color:#666;margin-top:4px;">Repair Invoice</div>
      <div class="meta">
        <div style="font-weight:700; color:#0066cc; font-size:16px;">${invoice.invoiceNumber}</div>
        <div style="margin-top:6px;">Date Received: ${(() => {
          const [y, m, d] = invoice.dateReceived.split('-');
          return new Date(parseInt(y), parseInt(m) - 1, parseInt(d)).toLocaleDateString('en-US');
        })()}</div>
        ${invoice.dateCompleted ? `<div style="margin-top:4px;">Date Completed: ${(() => {
          const [y, m, d] = invoice.dateCompleted.split('-');
          return new Date(parseInt(y), parseInt(m) - 1, parseInt(d)).toLocaleDateString('en-US');
        })()}</div>` : ''}
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
        <div class="value">${(() => {
          const [y, m, d] = invoice.dateReceived.split('-');
          return new Date(parseInt(y), parseInt(m) - 1, parseInt(d)).toLocaleDateString('en-US');
        })()}</div>
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
        ${invoice.isGeorgesMusic ? `
          <div class="row"><div>Your Charge</div><div>$${subtotal.toFixed(2)}</div></div>
          <div class="row"><div>6% Tax (on Your Charge)</div><div>$${yourTax.toFixed(2)}</div></div>
          <div class="row"><div>Your Charge + Tax</div><div>$${yourChargeWithTax.toFixed(2)}</div></div>
          <div class="row"><div>George's Markup (1.54x)</div><div>$${georgesSubtotal.toFixed(2)}</div></div>
          <div class="row total"><div>George's Total</div><div>$${georgesCustomerTotal.toFixed(2)}</div></div>
        ` : `
          <div class="row"><div>Subtotal</div><div>$${finalSubtotal.toFixed(2)}</div></div>
          <div class="row"><div>6% Tax</div><div>$${finalTax.toFixed(2)}</div></div>
          <div class="row total"><div>Customer Total</div><div>$${finalTotal.toFixed(2)}</div></div>
        `}
      </div>
    </div>

    <div class="footer">
      <div class="qr-grid">
        <div class="qr-item">
          <img src="${qrGoogle}" alt="Google QR" />
          <div class="qr-label">Google Review</div>
        </div>
        <div class="qr-item">
          <img src="${qrFacebook}" alt="Facebook QR" />
          <div class="qr-label">Facebook Review</div>
        </div>
        <div class="qr-item">
          <img src="${qrWebsite}" alt="Website QR" />
          <div class="qr-label">Our Website</div>
        </div>
      </div>

      <div class="msg">
        <div style="font-weight:700; color:#0b64b3; font-size:15px; margin-bottom:6px;">We appreciate your business</div>
        <div style="font-size:13px; color:#374151;">If you enjoyed our service, leaving a short review helps our small local business reach more musicians and keeps us doing what we love. Your thoughtful feedback truly makes a difference — thank you for your support.</div>
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
