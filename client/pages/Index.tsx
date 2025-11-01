import { useNavigate } from "react-router-dom";
import { RepairInvoice, RepairMaterial } from "@/lib/invoice-types";
import { generateInvoicePDF, downloadInvoicePDF } from "@/lib/pdf-generator";
import {
  addInvoiceToLocalStorage,
  exportAllInvoicesToCSV,
  getAllInvoicesFromLocalStorage,
  downloadCSV,
} from "@/lib/csv-exporter";
import { extractInvoiceData } from "@/lib/ocr-utils";
import { geocodeAddress, haversineMiles } from "@/lib/geocode";
import {
  Download,
  Plus,
  Trash2,
  FileText,
  Upload,
  Loader,
  Search,
} from "lucide-react";
import { AlertDialog, useAlert } from "@/components/AlertDialog";
import { useEffect, useState } from "react";

const BILL_PHONE_NUMBERS = [
  "610-505-6096",
  "6105056096",
  "(610) 505-6096",
  "610.505.6096",
];
const BILL_EMAILS = ["bill@delcomusicco.com", "billbaraldi@gmail.com"];

export default function Index() {
  const [showForm, setShowForm] = useState(true);
  const navigate = useNavigate();

  const [lastAssignedInvoiceNumber, setLastAssignedInvoiceNumber] =
    useState<number>(() => {
      const stored = localStorage.getItem("lastAssignedInvoiceNumber");
      return stored ? parseInt(stored, 10) || 0 : 0;
    });

  const [formData, setFormData] = useState({
    invoiceNumber: "" as string,
    dateReceived: new Date().toISOString().split("T")[0] as string,
    date: new Date().toISOString().split("T")[0] as string,
    customerName: "" as string,
    customerPhone: "" as string,
    customerEmail: "" as string,
    customerAddress: "" as string,
    repairDescription: "" as string,
    workDone: "" as string,
    laborHours: 0 as number,
    hourlyRate: 0 as number,
    isGeorgesMusic: false as boolean,
    isNoDeliveryFee: false as boolean,
    notes: "" as string,
  });

  const [instruments, setInstruments] = useState([
    { type: "", description: "" },
  ]);
  const [materials, setMaterials] = useState<RepairMaterial[]>([
    { description: "", quantity: 1, unitCost: 0 },
  ]);

  const [savedInvoices, setSavedInvoices] = useState<RepairInvoice[]>(() => {
    const invoices = getAllInvoicesFromLocalStorage();
    localStorage.setItem("delco-invoices", JSON.stringify(invoices));
    return invoices;
  });
  const [isProcessingOCR, setIsProcessingOCR] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [deliveryMiles, setDeliveryMiles] = useState<number | null>(null);
  const [deliveryFee, setDeliveryFee] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOldRepairFormat, setIsOldRepairFormat] = useState(false);
  const [batchRepairs, setBatchRepairs] = useState<any[]>([]);
  const [batchFormData, setBatchFormData] = useState<{ [key: string]: any }>(
    {},
  );
  const [showRecentModal, setShowRecentModal] = useState(false);
  const alert = useAlert();

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const results: any[] = [];
    for (const file of files) {
      try {
        const extracted = await extractInvoiceData(file);
        const id = `batch_${Date.now()}_${Math.random()}`;

        // Create form data for this repair
        // Sanitize extracted email/phone to avoid using our own contact info as customer data
        const rawEmail = (extracted.customerEmail || "").toString().trim();
        const normalizedEmail = rawEmail ? rawEmail.toLowerCase() : "";
        const customerEmail =
          normalizedEmail && BILL_EMAILS.includes(normalizedEmail)
            ? ""
            : rawEmail;

        const newFormData = {
          invoiceNumber:
            extracted.invoiceNumber ||
            String(lastAssignedInvoiceNumber + results.length + 1),
          dateReceived:
            extracted.dateReceived || new Date().toISOString().split("T")[0],
          date: extracted.date || new Date().toISOString().split("T")[0],
          customerName: extracted.customerName || "",
          customerPhone: extracted.customerPhone || "",
          customerEmail: customerEmail || "",
          customerAddress: extracted.customerAddress || "",
          repairDescription: extracted.repairDescription || "",
          workDone: extracted.workDone || "",
          laborHours: 0,
          hourlyRate: 0,
          isGeorgesMusic: extracted.isGeorgesMusic || false,
          isNoDeliveryFee: extracted.isNoDeliveryFee || false,
          notes: "",
        };

        results.push({
          id,
          fileName: file.name,
          extracted,
          formData: newFormData,
          materials: extracted.materials || [],
          instruments: extracted.instruments || [{ type: "", description: "" }],
          deliveryMiles: null,
          deliveryFee: 0,
        });

        setBatchFormData((prev) => ({ ...prev, [id]: newFormData }));

        // Calculate delivery fee if address was extracted
        if (newFormData.customerAddress && !newFormData.isGeorgesMusic && !newFormData.isNoDeliveryFee) {
          setTimeout(() => {
            calculateBatchDeliveryFee(
              id,
              newFormData.customerAddress,
              newFormData.isGeorgesMusic,
              newFormData.isNoDeliveryFee,
            );
          }, 100);
        }
      } catch (err) {
        console.error("Error processing file:", err);
      }
    }

    setBatchRepairs((prev) => [...prev, ...results]);
    e.target.value = "";
  };

  // Initialize lastAssignedInvoiceNumber, load invoices, and sync across tabs
  useEffect(() => {
    const invoices = getAllInvoicesFromLocalStorage();

    const numericInvoiceNumbers = invoices
      .map((inv) =>
        parseInt(String(inv.invoiceNumber).replace(/[^0-9]/g, ""), 10),
      )
      .filter((n) => !isNaN(n) && n > 0);
    const maxFromSaved =
      numericInvoiceNumbers.length > 0 ? Math.max(...numericInvoiceNumbers) : 0;

    const storedVal =
      parseInt(localStorage.getItem("lastAssignedInvoiceNumber") || "0", 10) ||
      0;
    const defaultStart = 33757;

    if (invoices.length === 0 && storedVal > defaultStart) {
      setLastAssignedInvoiceNumber(defaultStart);
      localStorage.setItem("lastAssignedInvoiceNumber", String(defaultStart));
    } else {
      if (maxFromSaved > storedVal) {
        setLastAssignedInvoiceNumber(maxFromSaved);
        localStorage.setItem("lastAssignedInvoiceNumber", String(maxFromSaved));
      } else if (storedVal === 0) {
        setLastAssignedInvoiceNumber(defaultStart);
        localStorage.setItem("lastAssignedInvoiceNumber", String(defaultStart));
      } else {
        setLastAssignedInvoiceNumber(storedVal);
      }
    }

    const handleFocus = () =>
      setSavedInvoices(getAllInvoicesFromLocalStorage());
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "delco-invoices")
        setSavedInvoices(getAllInvoicesFromLocalStorage());
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("storage", handleStorageChange);
    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  useEffect(() => {
    const next = lastAssignedInvoiceNumber + 1;
    setFormData((prev) => ({ ...prev, invoiceNumber: String(next) }));
  }, [lastAssignedInvoiceNumber]);

  const calculateDeliveryFee = async (address: string) => {
    if (
      !address ||
      !address.trim() ||
      formData.isGeorgesMusic ||
      formData.isNoDeliveryFee
    ) {
      setDeliveryMiles(null);
      setDeliveryFee(0);
      return;
    }

    try {
      let cleanAddr = address.trim();
      cleanAddr = cleanAddr
        .replace(
          /\b(?:Unit|Apt|Apt\.|Apartment|Suite|Ste|Ste\.|#)\s*[0-9A-Za-z\-]+/gi,
          "",
        )
        .trim();
      cleanAddr = cleanAddr.replace(/\s+/g, " ").replace(/,\s*,/g, ",").trim();

      const addressParts = cleanAddr.split(",").map((p) => p.trim());
      let street = addressParts[0];

      let customerCoords = null;
      const addressVariations: string[] = [];

      addressVariations.push(cleanAddr);
      if (!cleanAddr.includes("Pennsylvania")) {
        addressVariations.push(cleanAddr.replace(/,\s*PA\b/, ", Pennsylvania"));
      }

      for (const variation of addressVariations) {
        customerCoords = await geocodeAddress(variation);
        if (customerCoords) break;
      }

      if (!customerCoords) {
        setDeliveryMiles(null);
        setDeliveryFee(0);
        return;
      }

      const baseCoords = await geocodeAddress(
        "150 E Wynnewood Rd, Wynnewood, PA",
      );
      if (!baseCoords) {
        setDeliveryMiles(null);
        setDeliveryFee(0);
        return;
      }

      const miles = haversineMiles(
        baseCoords.lat,
        baseCoords.lon,
        customerCoords.lat,
        customerCoords.lon,
      );
      const roundedMiles = Math.round(miles);
      const fee = roundedMiles * 2 * 0.85;
      const finalFee = parseFloat(fee.toFixed(2));

      setDeliveryMiles(roundedMiles);
      setDeliveryFee(finalFee);
    } catch (err) {
      console.error("[DELIVERY] Error:", err);
      setDeliveryMiles(null);
      setDeliveryFee(0);
    }
  };

  const handleBatchRepairFormChange = (
    repairId: string,
    field: string,
    value: any,
  ) => {
    const newFormData = { ...(batchFormData[repairId] || {}), [field]: value };
    setBatchFormData((prev) => ({
      ...prev,
      [repairId]: newFormData,
    }));

    const repair = batchRepairs.find((r) => r.id === repairId);
    if (repair) {
      setBatchRepairs((prev) =>
        prev.map((r) =>
          r.id === repairId ? { ...r, formData: newFormData } : r,
        ),
      );
    }

    if (field === "customerAddress") {
      calculateBatchDeliveryFee(
        repairId,
        value,
        newFormData.isGeorgesMusic,
        newFormData.isNoDeliveryFee,
      );
    }

    if (field === "isGeorgesMusic" || field === "isNoDeliveryFee") {
      const address =
        field === "customerAddress" ? value : newFormData.customerAddress;
      calculateBatchDeliveryFee(
        repairId,
        address,
        field === "isGeorgesMusic" ? value : newFormData.isGeorgesMusic,
        field === "isNoDeliveryFee" ? value : newFormData.isNoDeliveryFee,
      );
    }
  };

  const handleBatchMaterialChange = (
    repairId: string,
    index: number,
    field: keyof RepairMaterial,
    value: any,
  ) => {
    setBatchRepairs((prev) =>
      prev.map((r) => {
        if (r.id !== repairId) return r;
        const materials = Array.isArray(r.materials) ? [...r.materials] : [];
        const existing = materials[index] || {
          description: "",
          quantity: 1,
          unitCost: 0,
        };
        const updated = {
          ...existing,
          [field]:
            field === "description" ? String(value) : parseFloat(value) || 0,
        };
        materials[index] = updated;
        // Ensure batchFormData also reflects materials
        setBatchFormData((prevForm) => ({
          ...prevForm,
          [repairId]: { ...(prevForm[repairId] || {}), materials },
        }));
        return { ...r, materials };
      }),
    );
  };

  const calculateBatchDeliveryFee = async (
    repairId: string,
    address: string,
    isGeorgesMusic?: boolean,
    isNoDeliveryFee?: boolean,
  ) => {
    if (
      !address ||
      !address.trim() ||
      isGeorgesMusic ||
      isNoDeliveryFee
    ) {
      setBatchRepairs((prev) =>
        prev.map((r) =>
          r.id === repairId ? { ...r, deliveryMiles: null, deliveryFee: 0 } : r,
        ),
      );
      return;
    }

    try {
      let cleanAddr = address.trim();
      cleanAddr = cleanAddr
        .replace(
          /\b(?:Unit|Apt|Apt\.|Apartment|Suite|Ste|Ste\.|#)\s*[0-9A-Za-z\-]+/gi,
          "",
        )
        .trim();
      cleanAddr = cleanAddr.replace(/\s+/g, " ").replace(/,\s*,/g, ",").trim();

      let customerCoords = null;
      const addressVariations: string[] = [];

      addressVariations.push(cleanAddr);
      if (!cleanAddr.includes("Pennsylvania")) {
        addressVariations.push(cleanAddr.replace(/,\s*PA\b/, ", Pennsylvania"));
      }

      for (const variation of addressVariations) {
        customerCoords = await geocodeAddress(variation);
        if (customerCoords) break;
      }

      if (!customerCoords) {
        setBatchRepairs((prev) =>
          prev.map((r) =>
            r.id === repairId ? { ...r, deliveryMiles: null, deliveryFee: 0 } : r,
          ),
        );
        return;
      }

      const baseCoords = await geocodeAddress(
        "150 E Wynnewood Rd, Wynnewood, PA",
      );
      if (!baseCoords) {
        setBatchRepairs((prev) =>
          prev.map((r) =>
            r.id === repairId ? { ...r, deliveryMiles: null, deliveryFee: 0 } : r,
          ),
        );
        return;
      }

      const miles = haversineMiles(
        baseCoords.lat,
        baseCoords.lon,
        customerCoords.lat,
        customerCoords.lon,
      );
      const roundedMiles = Math.round(miles);
      const fee = roundedMiles * 2 * 0.85;
      const finalFee = parseFloat(fee.toFixed(2));

      setBatchRepairs((prev) =>
        prev.map((r) =>
          r.id === repairId
            ? { ...r, deliveryMiles: roundedMiles, deliveryFee: finalFee }
            : r,
        ),
      );
    } catch (err) {
      console.error("[DELIVERY BATCH] Error:", err);
      setBatchRepairs((prev) =>
        prev.map((r) =>
          r.id === repairId ? { ...r, deliveryMiles: null, deliveryFee: 0 } : r,
        ),
      );
    }
  };

  const saveBatchRepair = (repairId: string) => {
    const repair = batchRepairs.find((r) => r.id === repairId);
    if (!repair) return;

    const data = batchFormData[repairId];
    const invoice = {
      invoiceNumber: data.invoiceNumber,
      dateReceived: data.dateReceived,
      date: data.date,
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      customerEmail: data.customerEmail,
      customerAddress: data.customerAddress || "",
      deliveryMiles: repair.deliveryMiles || 0,
      deliveryFee: repair.deliveryFee || 0,
      instruments: repair.instruments,
      repairDescription: data.repairDescription,
      workDone: data.workDone || '',
      materials: repair.materials,
      laborHours: data.laborHours || 0,
      hourlyRate: data.hourlyRate || 0,
      notes: data.notes || "",
      isGeorgesMusic: data.isGeorgesMusic || false,
      isNoDeliveryFee: data.isNoDeliveryFee || false,
      invoiceHtml: "",
    } as any;

    addInvoiceToLocalStorage(invoice);
    setSavedInvoices(getAllInvoicesFromLocalStorage());
    setLastAssignedInvoiceNumber(
      parseInt(data.invoiceNumber) || lastAssignedInvoiceNumber + 1,
    );

    setBatchRepairs((prev) => prev.filter((r) => r.id !== repairId));
    alert.show(`Saved invoice ${invoice.invoiceNumber}`, "success");
  };

  const removeBatchRepair = (repairId: string) => {
    setBatchRepairs((prev) => prev.filter((r) => r.id !== repairId));
    setBatchFormData((prev) => {
      const newData = { ...prev };
      delete newData[repairId];
      return newData;
    });
  };

  const handleOCRUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // If multiple files, use batch handler
    if (files.length > 1) {
      await handleBulkUpload(e);
      return;
    }

    const file = files[0];

    setIsProcessingOCR(true);
    setOcrProgress(30);

    try {
      const extracted = await extractInvoiceData(file);
      setOcrProgress(80);

      let phone = extracted.customerPhone || "";
      let email = (extracted.customerEmail || "").toString().trim();

      const phoneDigitsOnly = phone.replace(/\D/g, "");
      if (
        BILL_PHONE_NUMBERS.some((p) => p.replace(/\D/g, "") === phoneDigitsOnly)
      ) {
        phone = "";
      }

      const normalizedEmail = email.toLowerCase();
      if (normalizedEmail && BILL_EMAILS.includes(normalizedEmail)) {
        email = "";
      }

      // Detect if this is an old repair format
      const isOldFormat = extracted.isOldRepairFormat || false;
      setIsOldRepairFormat(isOldFormat);

      setFormData((prev) => ({
        ...prev,
        invoiceNumber: extracted.invoiceNumber || prev.invoiceNumber,
        dateReceived: extracted.dateReceived || prev.dateReceived,
        customerName: extracted.customerName || prev.customerName,
        customerPhone: phone || prev.customerPhone,
        customerEmail: email || prev.customerEmail,
        customerAddress: extracted.customerAddress || prev.customerAddress,
        repairDescription:
          extracted.repairDescription || prev.repairDescription,
        workDone: extracted.workDone || prev.workDone,
        // Apply detected flags from OCR
        isGeorgesMusic: typeof extracted.isGeorgesMusic === 'boolean' ? extracted.isGeorgesMusic : (isOldFormat ? false : prev.isGeorgesMusic),
        isNoDeliveryFee: typeof extracted.isNoDeliveryFee === 'boolean' ? extracted.isNoDeliveryFee : prev.isNoDeliveryFee,
      }));

      if (extracted.instruments && extracted.instruments.length > 0) {
        setInstruments(extracted.instruments);
      }

      if (extracted.materials && extracted.materials.length > 0) {
        console.log("[OCR HANDLER] Setting materials:", extracted.materials);
        setMaterials(extracted.materials);
      } else {
        console.log(
          "[OCR HANDLER] No materials extracted:",
          extracted.materials,
        );
      }

      if (extracted.customerAddress) {
        await calculateDeliveryFee(extracted.customerAddress);
      }

      setOcrProgress(100);
      setTimeout(() => {
        alert.show(
          "Invoice data extracted successfully! Please review and adjust as needed.",
          "success",
        );
        setOcrProgress(0);
      }, 500);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error("OCR Error:", errorMsg);
      alert.show(errorMsg, "error");
      setOcrProgress(0);
    } finally {
      setIsProcessingOCR(false);
      e.target.value = "";
    }
  };

  const handleFormChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));

    if (name === "customerAddress") {
      calculateDeliveryFee(value);
    }
  };

  const handleInstrumentChange = (
    index: number,
    field: "type" | "description",
    value: string,
  ) => {
    const newInstruments = [...instruments];
    newInstruments[index][field] = value;
    setInstruments(newInstruments);
  };

  const addInstrument = () => {
    setInstruments([...instruments, { type: "", description: "" }]);
  };

  const removeInstrument = (index: number) => {
    setInstruments(instruments.filter((_, i) => i !== index));
  };

  const handleMaterialChange = (
    index: number,
    field: keyof RepairMaterial,
    value: string | number,
  ) => {
    const newMaterials = [...materials];
    if (field === "quantity" || field === "unitCost") {
      newMaterials[index][field] = parseFloat(value as string) || 0;
    } else {
      newMaterials[index][field] = value as string;
    }
    setMaterials(newMaterials);
  };

  const addMaterial = () => {
    setMaterials([...materials, { description: "", quantity: 1, unitCost: 0 }]);
  };

  const removeMaterial = (index: number) => {
    setMaterials(materials.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      if (!formData.invoiceNumber) {
        alert.show("Please enter an Invoice Number", "warning");
        return;
      }

      if (
        !formData.customerName ||
        instruments.some((i) => !i.type) ||
        !formData.repairDescription
      ) {
        alert.show(
          "Please fill in: Invoice #, Customer Name, Instrument Type(s), and Repair Description",
          "warning",
        );
        return;
      }

      const parsed = parseInt(
        String(formData.invoiceNumber).replace(/[^0-9]/g, ""),
        10,
      );
      const assignedNum =
        !isNaN(parsed) && parsed > 0 ? parsed : lastAssignedInvoiceNumber + 1;

      const invoice: RepairInvoice = {
        ...formData,
        invoiceNumber: String(assignedNum),
        instruments: instruments.filter((i) => i.type.trim()),
        materials: materials.filter((m) => m.description.trim()),
        deliveryMiles: deliveryMiles ?? 0,
        deliveryFee: formData.isGeorgesMusic ? 0 : deliveryFee || 0,
        invoiceHtml: "",
      };

      // Only update invoice counter if this is NOT an old repair format
      if (!isOldRepairFormat) {
        setLastAssignedInvoiceNumber(assignedNum);
        localStorage.setItem("lastAssignedInvoiceNumber", String(assignedNum));
      }

      let invoiceHtml = "";
      try {
        if (typeof generateInvoicePDF === "function") {
          invoiceHtml = generateInvoicePDF(invoice);
          invoice.invoiceHtml = invoiceHtml;
        } else {
          invoice.invoiceHtml = "";
        }
      } catch (err) {
        console.error("PDF generation error:", err);
        invoice.invoiceHtml = "";
      }

      addInvoiceToLocalStorage(invoice);
      setSavedInvoices(getAllInvoicesFromLocalStorage());

      try {
        downloadInvoicePDF(invoice);
      } catch (err) {
        console.error("Download/print error:", err);
      }

      // Calculate next invoice number
      const nextInvoiceNum = isOldRepairFormat
        ? lastAssignedInvoiceNumber + 1
        : assignedNum + 1;

      setFormData({
        invoiceNumber: String(nextInvoiceNum),
        dateReceived: formData.dateReceived,
        date: formData.date,
        customerName: "",
        customerPhone: "",
        customerEmail: "",
        customerAddress: "",
        repairDescription: "",
        workDone: "",
        laborHours: 0,
        hourlyRate: 0,
        isGeorgesMusic: false,
        isNoDeliveryFee: false,
        notes: "",
      });

      setInstruments([{ type: "", description: "" }]);
      setMaterials([{ description: "", quantity: 1, unitCost: 0 }]);
      setDeliveryMiles(null);
      setDeliveryFee(0);
      setIsOldRepairFormat(false);
      alert.show("Invoice created and saved! PDF ready to print.", "success");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteInvoice = (invoiceNumber: string) => {
    const updatedInvoices = savedInvoices.filter(
      (inv) => inv.invoiceNumber !== invoiceNumber,
    );
    setSavedInvoices(updatedInvoices);
    localStorage.setItem("delco-invoices", JSON.stringify(updatedInvoices));

    const parsed = parseInt(String(invoiceNumber).replace(/[^0-9]/g, ""), 10);
    if (!isNaN(parsed) && parsed === lastAssignedInvoiceNumber) {
      const newLast = Math.max(0, lastAssignedInvoiceNumber - 1);
      setLastAssignedInvoiceNumber(newLast);
      localStorage.setItem("lastAssignedInvoiceNumber", String(newLast));
    }

    alert.show("Repair deleted successfully.", "success");
  };

  const calculateTotals = () => {
    const servicesTotal = materials.reduce(
      (sum, mat) => sum + mat.quantity * mat.unitCost,
      0,
    );
    const subtotal = servicesTotal;

    const deliveryAmount =
      formData.isGeorgesMusic || formData.isNoDeliveryFee
        ? 0
        : deliveryFee || 0;
    const subtotalWithDelivery = subtotal + deliveryAmount;
    const tax = subtotalWithDelivery * 0.06;
    const total = subtotalWithDelivery + tax;

    // George's: upcharge applied AFTER tax on your charge
    const yourTax = subtotal * 0.06;
    const yourChargeWithTax = subtotal + yourTax;
    const georgesSubtotal = yourChargeWithTax * 1.54;
    const georgesTax = 0; // Tax already included in the 1.54 multiplier
    const georgesTotal = georgesSubtotal;

    return {
      servicesTotal,
      subtotal,
      delivery: deliveryAmount,
      tax,
      total,
      yourTax,
      yourChargeWithTax,
      georgesSubtotal,
      georgesTax,
      georgesTotal,
    };
  };

  const totals = calculateTotals();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="h-1 bg-primary"></div>
        <header className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img
                src="https://cdn.builder.io/api/v1/image/assets%2F99d159038b9d45ab8f72730367c1abf4%2F9753a3ec93ee4d5dba7a86a75c0f457f?format=webp&width=800"
                alt="Delco Music Co"
                className="h-10 object-contain"
              />
              <div>
                <div className="text-xl font-bold text-primary">
                  Delco Music Co
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Repair Invoice Manager
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowForm(!showForm)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-foreground font-semibold rounded-sm transition-colors text-sm"
              >
                {showForm ? "Hide Form" : "Show Form"}
              </button>
              <button
                onClick={() => setShowRecentModal(true)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-foreground font-semibold rounded-sm transition-colors text-sm"
              >
                Recent Invoices
              </button>
              <button
                onClick={() => navigate("/records")}
                className="btn-primary flex items-center gap-2"
              >
                <FileText size={16} />
                Records
              </button>
            </div>
          </div>
        </header>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {showForm && (
            <div className="lg:col-start-2 lg:col-span-10">
              <div className="card-modern p-8">
                <h2 className="text-2xl font-bold text-foreground mb-6">
                  New Invoice
                </h2>

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">
                      📸 Auto-Fill from Image
                    </label>
                    <div className="relative border-2 border-dashed border-primary/30 rounded-sm p-6 bg-blue-50 hover:border-primary/50 transition-colors cursor-pointer group">
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleOCRUpload}
                        disabled={isProcessingOCR}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <div className="text-center">
                        {isProcessingOCR ? (
                          <>
                            <Loader
                              className="mx-auto mb-1 animate-spin text-primary"
                              size={18}
                            />
                            <p className="text-xs font-semibold text-foreground">
                              Processing... {ocrProgress}%
                            </p>
                          </>
                        ) : (
                          <>
                            <Upload
                              className="mx-auto mb-1 text-primary group-hover:scale-110 transition-transform"
                              size={18}
                            />
                            <p className="text-xs font-semibold text-foreground">
                              Upload invoice screenshot
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {batchRepairs.length > 0 && (
                    <div className="mt-6 border-t pt-6">
                      <h3 className="text-lg font-bold mb-4">
                        Batch Repairs ({batchRepairs.length})
                      </h3>
                      <div className="flex gap-6 overflow-x-auto pb-4">
                        {batchRepairs.map((repair) => {
                          const data =
                            batchFormData[repair.id] || repair.formData;
                          const subtotal = repair.materials.reduce(
                            (sum: number, m: any) =>
                              sum + m.quantity * m.unitCost,
                            0,
                          );
                          const delivery =
                            data.isGeorgesMusic || data.isNoDeliveryFee
                              ? 0
                              : repair.deliveryFee || 0;
                          const subtotalWithDelivery = subtotal + delivery;
                          const tax = subtotalWithDelivery * 0.06;
                          const total = subtotalWithDelivery + tax;

                          return (
                            <div
                              key={repair.id}
                              className="min-w-[900px] bg-white rounded shadow border p-6"
                            >
                              <div className="text-sm font-semibold mb-4 text-primary">
                                New Invoice 📸 Auto-Fill from Image
                              </div>

                              <div className="grid grid-cols-3 gap-3 mb-4">
                                <div>
                                  <label className="block text-xs font-semibold mb-1">
                                    Invoice # *
                                  </label>
                                  <input
                                    type="text"
                                    value={data.invoiceNumber}
                                    onChange={(e) =>
                                      handleBatchRepairFormChange(
                                        repair.id,
                                        "invoiceNumber",
                                        e.target.value,
                                      )
                                    }
                                    className="input-modern text-sm w-full"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-semibold mb-1">
                                    Date Received
                                  </label>
                                  <input
                                    type="date"
                                    value={data.dateReceived}
                                    onChange={(e) =>
                                      handleBatchRepairFormChange(
                                        repair.id,
                                        "dateReceived",
                                        e.target.value,
                                      )
                                    }
                                    className="input-modern text-sm w-full"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-semibold mb-1">
                                    Invoice Date
                                  </label>
                                  <input
                                    type="date"
                                    value={data.date}
                                    onChange={(e) =>
                                      handleBatchRepairFormChange(
                                        repair.id,
                                        "date",
                                        e.target.value,
                                      )
                                    }
                                    className="input-modern text-sm w-full"
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-3 gap-3 mb-4">
                                <div>
                                  <label className="block text-xs font-semibold mb-1">
                                    Customer Name *
                                  </label>
                                  <input
                                    type="text"
                                    value={data.customerName}
                                    onChange={(e) =>
                                      handleBatchRepairFormChange(
                                        repair.id,
                                        "customerName",
                                        e.target.value,
                                      )
                                    }
                                    className="input-modern text-sm w-full"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-semibold mb-1">
                                    Phone
                                  </label>
                                  <input
                                    type="tel"
                                    value={data.customerPhone}
                                    onChange={(e) =>
                                      handleBatchRepairFormChange(
                                        repair.id,
                                        "customerPhone",
                                        e.target.value,
                                      )
                                    }
                                    className="input-modern text-sm w-full"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-semibold mb-1">
                                    Email
                                  </label>
                                  <input
                                    type="email"
                                    value={data.customerEmail}
                                    onChange={(e) =>
                                      handleBatchRepairFormChange(
                                        repair.id,
                                        "customerEmail",
                                        e.target.value,
                                      )
                                    }
                                    className="input-modern text-sm w-full"
                                  />
                                </div>
                              </div>

                              <div className="mb-4">
                                <label className="block text-xs font-semibold mb-1">
                                  Address
                                </label>
                                <input
                                  type="text"
                                  value={data.customerAddress}
                                  onChange={(e) =>
                                    handleBatchRepairFormChange(
                                      repair.id,
                                      "customerAddress",
                                      e.target.value,
                                    )
                                  }
                                  className="input-modern text-sm w-full"
                                />
                              </div>

                              <div className="flex items-center gap-4 mb-4">
                                <label className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={data.isGeorgesMusic}
                                    onChange={(e) =>
                                      handleBatchRepairFormChange(
                                        repair.id,
                                        "isGeorgesMusic",
                                        e.target.checked,
                                      )
                                    }
                                    className="w-4 h-4"
                                  />
                                  <span className="text-xs">
                                    George's Music
                                  </span>
                                </label>
                                <label className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={data.isNoDeliveryFee}
                                    onChange={(e) =>
                                      handleBatchRepairFormChange(
                                        repair.id,
                                        "isNoDeliveryFee",
                                        e.target.checked,
                                      )
                                    }
                                    className="w-4 h-4"
                                  />
                                  <span className="text-xs">
                                    No Delivery Fee
                                  </span>
                                </label>
                              </div>

                              <div className="mb-4 pb-4 border-t pt-4">
                                <label className="block text-xs font-semibold mb-2">
                                  Instruments *
                                </label>
                                <div className="space-y-2">
                                  {repair.instruments.map(
                                    (inst: any, idx: number) => (
                                      <div
                                        key={idx}
                                        className="grid grid-cols-3 gap-2 items-center"
                                      >
                                        <select
                                          value={inst.type || ""}
                                          onChange={(e) => {
                                            const updated = [
                                              ...repair.instruments,
                                            ];
                                            updated[idx].type = e.target.value;
                                            setBatchRepairs((prev) =>
                                              prev.map((r) =>
                                                r.id === repair.id
                                                  ? {
                                                      ...r,
                                                      instruments: updated,
                                                    }
                                                  : r,
                                              ),
                                            );
                                          }}
                                          className="input-modern text-sm"
                                        >
                                          <option value="">Select Type</option>
                                          <option value="Guitar">Guitar</option>
                                          <option value="Bass">Bass</option>
                                          <option value="Violin">Violin</option>
                                          <option value="Other">Other</option>
                                        </select>
                                        <input
                                          type="text"
                                          value={inst.description || ""}
                                          onChange={(e) => {
                                            const updated = [
                                              ...repair.instruments,
                                            ];
                                            updated[idx].description =
                                              e.target.value;
                                            setBatchRepairs((prev) =>
                                              prev.map((r) =>
                                                r.id === repair.id
                                                  ? {
                                                      ...r,
                                                      instruments: updated,
                                                    }
                                                  : r,
                                              ),
                                            );
                                          }}
                                          placeholder="Description"
                                          className="input-modern text-sm"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setBatchRepairs((prev) =>
                                              prev.map((r) =>
                                                r.id === repair.id
                                                  ? {
                                                      ...r,
                                                      instruments: r.instruments.filter(
                                                        (_: any, i: number) => i !== idx
                                                      ),
                                                    }
                                                  : r,
                                              ),
                                            );
                                          }}
                                          className="text-red-600 hover:text-red-900 font-semibold text-sm"
                                        >
                                          Remove
                                        </button>
                                      </div>
                                    ),
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setBatchRepairs((prev) =>
                                      prev.map((r) =>
                                        r.id === repair.id
                                          ? {
                                              ...r,
                                              instruments: [
                                                ...r.instruments,
                                                { type: "", description: "" },
                                              ],
                                            }
                                          : r,
                                      ),
                                    );
                                  }}
                                  className="text-xs text-primary font-semibold mt-2"
                                >
                                  + Add Instrument
                                </button>
                              </div>

                              <div className="mb-4">
                                <label className="block text-xs font-semibold mb-1">
                                  Repair Work Description *
                                </label>
                                <textarea
                                  value={data.repairDescription}
                                  onChange={(e) =>
                                    handleBatchRepairFormChange(
                                      repair.id,
                                      "repairDescription",
                                      e.target.value,
                                    )
                                  }
                                  className="input-modern text-sm w-full min-h-16"
                                />
                              </div>

                              <div className="mb-4">
                                <label className="block text-xs font-semibold mb-1">Work Done</label>
                                <textarea
                                  value={data.workDone || ''}
                                  onChange={(e) => handleBatchRepairFormChange(repair.id, 'workDone', e.target.value)}
                                  className="input-modern text-sm w-full min-h-16"
                                />
                              </div>

                              <div className="mb-4 pb-4 border-t pt-4">
                                <label className="block text-xs font-semibold mb-2">
                                  Services & Materials
                                </label>
                                <div className="space-y-2 text-xs">
                                  {(repair.materials || []).map(
                                    (m: any, mi: number) => (
                                      <div
                                        key={`${mi}-${m.description || "mat"}`}
                                        className="grid grid-cols-5 gap-2 items-center"
                                      >
                                        <input
                                          type="text"
                                          value={m.description || ""}
                                          onChange={(e) =>
                                            handleBatchMaterialChange(
                                              repair.id,
                                              mi,
                                              "description",
                                              e.target.value,
                                            )
                                          }
                                          className="input-modern text-xs col-span-2"
                                          placeholder="Description"
                                        />
                                        <input
                                          type="number"
                                          min="1"
                                          value={m.quantity}
                                          onChange={(e) =>
                                            handleBatchMaterialChange(
                                              repair.id,
                                              mi,
                                              "quantity",
                                              e.target.value,
                                            )
                                          }
                                          className="input-modern text-xs"
                                        />
                                        <input
                                          type="number"
                                          step="0.01"
                                          min="0"
                                          value={m.unitCost}
                                          onChange={(e) =>
                                            handleBatchMaterialChange(
                                              repair.id,
                                              mi,
                                              "unitCost",
                                              e.target.value,
                                            )
                                          }
                                          className="input-modern text-xs"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setBatchRepairs((prev) =>
                                              prev.map((r) =>
                                                r.id === repair.id
                                                  ? {
                                                      ...r,
                                                      materials: r.materials.filter(
                                                        (_: any, i: number) => i !== mi
                                                      ),
                                                    }
                                                  : r,
                                              ),
                                            );
                                          }}
                                          className="text-red-600 text-xs col-span-1 justify-self-end"
                                        >
                                          Remove
                                        </button>
                                      </div>
                                    ),
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setBatchRepairs((prev) =>
                                      prev.map((r) =>
                                        r.id === repair.id
                                          ? {
                                              ...r,
                                              materials: [
                                                ...r.materials,
                                                { description: "", quantity: 1, unitCost: 0 },
                                              ],
                                            }
                                          : r,
                                      ),
                                    );
                                  }}
                                  className="text-xs text-primary font-semibold mt-2"
                                >
                                  + Add Material
                                </button>
                              </div>

                              <div className="bg-gray-50 p-3 rounded mb-4">
                                <div className="flex justify-between text-xs mb-1">
                                  <span>Services</span>
                                  <span>${subtotal.toFixed(2)}</span>
                                </div>
                                {!data.isGeorgesMusic &&
                                  !data.isNoDeliveryFee && (
                                    <div className="flex justify-between text-xs mb-1">
                                      <span>Delivery</span>
                                      <span>${delivery.toFixed(2)}</span>
                                    </div>
                                  )}
                                <div className="flex justify-between text-xs mb-1">
                                  <span>Tax (6%)</span>
                                  <span>${tax.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-xs font-bold">
                                  <span>Total</span>
                                  <span>${total.toFixed(2)}</span>
                                </div>
                              </div>

                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => saveBatchRepair(repair.id)}
                                  className="btn-primary inline-flex items-center px-5 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  Print & Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeBatchRepair(repair.id)}
                                  className="px-4 py-2 bg-red-50 text-red-600 rounded text-sm"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {batchRepairs.length === 0 && (
                    <>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-foreground mb-1">
                            Invoice # *
                          </label>
                          <input
                            type="text"
                            name="invoiceNumber"
                            value={formData.invoiceNumber}
                            onChange={handleFormChange}
                            placeholder="e.g., 33758"
                            className="input-modern text-sm"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-foreground mb-1">
                            Date Received
                          </label>
                          <input
                            type="date"
                            name="dateReceived"
                            value={formData.dateReceived}
                            onChange={handleFormChange}
                            className="input-modern text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-foreground mb-1">
                            Invoice Date
                          </label>
                          <input
                            type="date"
                            name="date"
                            value={formData.date}
                            onChange={handleFormChange}
                            className="input-modern text-sm"
                            required
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-foreground mb-1">
                            Customer Name *
                          </label>
                          <input
                            type="text"
                            name="customerName"
                            value={formData.customerName}
                            onChange={handleFormChange}
                            placeholder="Name"
                            className="input-modern text-sm"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-foreground mb-1">
                            Phone
                          </label>
                          <input
                            type="tel"
                            name="customerPhone"
                            value={formData.customerPhone}
                            onChange={handleFormChange}
                            placeholder="Phone"
                            className="input-modern text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-foreground mb-1">
                            Email
                          </label>
                          <input
                            type="email"
                            name="customerEmail"
                            value={formData.customerEmail}
                            onChange={handleFormChange}
                            placeholder="Email"
                            className="input-modern text-sm"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-foreground mb-1">
                            Address
                          </label>
                          <input
                            type="text"
                            name="customerAddress"
                            value={formData.customerAddress}
                            onChange={handleFormChange}
                            placeholder="Address"
                            className="input-modern text-sm"
                          />
                        </div>
                        <div>
                          <div className="flex items-center gap-4 mt-2">
                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                name="isGeorgesMusic"
                                checked={formData.isGeorgesMusic}
                                onChange={handleFormChange}
                                className="w-4 h-4"
                              />
                              <span className="text-xs">George's Music</span>
                            </label>
                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                name="isNoDeliveryFee"
                                checked={formData.isNoDeliveryFee}
                                onChange={handleFormChange}
                                className="w-4 h-4"
                              />
                              <span className="text-xs">No Delivery Fee</span>
                            </label>
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-foreground mb-2">
                          Instruments *
                        </label>
                        <div className="space-y-2">
                          {instruments.map((instrument, index) => (
                            <div
                              key={`instr-${index}`}
                              className="grid grid-cols-4 gap-2"
                            >
                              <select
                                value={instrument.type}
                                onChange={(e) =>
                                  handleInstrumentChange(
                                    index,
                                    "type",
                                    e.target.value,
                                  )
                                }
                                className="input-modern text-sm"
                              >
                                <option value="">Select Type</option>
                                <option value="Guitar">Guitar</option>
                                <option value="Bass">Bass</option>
                                <option value="Violin">Violin</option>
                                <option value="Cello">Cello</option>
                                <option value="Other">Other</option>
                              </select>
                              <input
                                type="text"
                                placeholder="Description"
                                value={instrument.description}
                                onChange={(e) =>
                                  handleInstrumentChange(
                                    index,
                                    "description",
                                    e.target.value,
                                  )
                                }
                                className="input-modern col-span-2 text-sm"
                              />
                              <button
                                type="button"
                                onClick={() => removeInstrument(index)}
                                className="text-red-600 hover:text-red-900 font-semibold text-sm"
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={addInstrument}
                            className="text-xs text-primary font-semibold"
                          >
                            + Add Instrument
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-foreground mb-1">
                          Repair Work Description *
                        </label>
                        <textarea
                          name="repairDescription"
                          value={formData.repairDescription}
                          onChange={handleFormChange}
                          placeholder="Describe the repair work"
                          className="input-modern text-sm min-h-24 resize-none"
                          required
                        />
                      </div>

                      {formData.isGeorgesMusic && (
                        <div>
                          <label className="block text-xs font-semibold text-foreground mb-1">Work Done</label>
                          <textarea
                            name="workDone"
                            value={formData.workDone}
                            onChange={handleFormChange}
                            placeholder="Describe the work performed"
                            className="input-modern text-sm min-h-24 resize-none"
                          />
                        </div>
                      )}

                      <div>
                        <label className="block text-xs font-semibold text-foreground mb-2">
                          Services & Materials
                        </label>
                        <div className="space-y-2">
                          {materials.map((material, index) => (
                            <div
                              key={`mat-${index}`}
                              className="grid grid-cols-5 gap-2 items-center"
                            >
                              <input
                                type="text"
                                placeholder="Description"
                                value={material.description}
                                onChange={(e) =>
                                  handleMaterialChange(
                                    index,
                                    "description",
                                    e.target.value,
                                  )
                                }
                                className="input-modern col-span-2 text-sm"
                              />
                              <input
                                type="number"
                                placeholder="Qty"
                                min="1"
                                value={material.quantity}
                                onChange={(e) =>
                                  handleMaterialChange(
                                    index,
                                    "quantity",
                                    e.target.value,
                                  )
                                }
                                className="input-modern text-sm"
                              />
                              <input
                                type="number"
                                placeholder="Cost"
                                min="0"
                                step="0.01"
                                value={material.unitCost}
                                onChange={(e) =>
                                  handleMaterialChange(
                                    index,
                                    "unitCost",
                                    e.target.value,
                                  )
                                }
                                className="input-modern text-sm"
                              />
                              <button
                                type="button"
                                onClick={() => removeMaterial(index)}
                                className="text-red-600 text-xs col-span-1 justify-self-end"
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={addMaterial}
                            className="text-xs text-primary font-semibold"
                          >
                            + Add Item
                          </button>
                        </div>
                      </div>

                      {deliveryMiles !== null &&
                        !formData.isGeorgesMusic &&
                        !formData.isNoDeliveryFee && (
                          <div className="bg-blue-50 p-3 rounded border border-blue-200">
                            <div className="flex justify-between text-sm">
                              <span className="font-semibold text-blue-900">
                                Delivery Fee ({deliveryMiles} miles × 2 trips)
                              </span>
                              <span className="font-semibold text-blue-900">
                                ${deliveryFee.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        )}

                      <div className="card-modern p-4 bg-gray-50">
                        <h3 className="text-sm font-semibold mb-3">Summary</h3>
                        <div className="text-sm space-y-1">
                          <div className="flex justify-between">
                            <div>Services</div>
                            <div>${totals.servicesTotal.toFixed(2)}</div>
                          </div>
                          <div className="flex justify-between">
                            <div>Delivery</div>
                            <div>${totals.delivery.toFixed(2)}</div>
                          </div>
                          <div className="flex justify-between">
                            <div>Tax (6%)</div>
                            <div>${totals.tax.toFixed(2)}</div>
                          </div>
                          <div className="flex justify-between font-bold border-t pt-1 mt-1">
                            <div>Total</div>
                            <div>${totals.total.toFixed(2)}</div>
                          </div>

                          {formData.isGeorgesMusic && (
                            <div className="mt-3 p-3 bg-blue-50 rounded border border-blue-200">
                              <div className="text-xs text-blue-900 font-semibold mb-2">
                                George's Music Invoice (1.54x)
                              </div>
                              <div className="text-xs space-y-1">
                                <div className="flex justify-between">
                                  <div>Repair Total</div>
                                  <div>${totals.subtotal.toFixed(2)}</div>
                                </div>
                                <div className="flex justify-between">
                                  <div>6% Tax (on Repair Total)</div>
                                  <div>${totals.yourTax.toFixed(2)}</div>
                                </div>
                                <div className="flex justify-between">
                                  <div>Repair Total + Tax</div>
                                  <div>
                                    ${totals.yourChargeWithTax.toFixed(2)}
                                  </div>
                                </div>
                                <div className="flex justify-between">
                                  <div>George's Markup (1.54x)</div>
                                  <div>
                                    ${totals.georgesSubtotal.toFixed(2)}
                                  </div>
                                </div>
                                <div className="flex justify-between font-semibold border-t pt-1 mt-1">
                                  <div>George's Total</div>
                                  <div>${totals.georgesTotal.toFixed(2)}</div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="pt-4 text-center">
                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className="btn-primary inline-flex items-center px-5 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isSubmitting
                            ? "Printing & Saving..."
                            : "Print & Save"}
                        </button>
                      </div>
                    </>
                  )}
                </form>
              </div>
            </div>
          )}
        </div>
      </main>

      <AlertDialog
        title=""
        message={alert.message}
        isOpen={alert.isOpen}
        onClose={alert.close}
        type={alert.type}
      />

      {showRecentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black opacity-40"
            onClick={() => setShowRecentModal(false)}
          ></div>
          <div className="relative bg-white rounded shadow-lg w-[90%] max-w-2xl p-6 z-10">
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-lg font-bold">Recent Invoices</h3>
              <button
                onClick={() => setShowRecentModal(false)}
                className="text-sm text-red-600 font-semibold"
              >
                Close
              </button>
            </div>
            <div className="max-h-[60vh] overflow-auto space-y-3">
              {savedInvoices.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No invoices yet
                </div>
              ) : (
                savedInvoices
                  .slice()
                  .reverse()
                  .map((inv) => (
                    <div
                      key={`${inv.invoiceNumber}-${inv.dateReceived}`}
                      className="border rounded p-3 flex items-center justify-between"
                    >
                      <div>
                        <div className="font-semibold">
                          #{inv.invoiceNumber} {inv.customerName}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {inv.dateReceived}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => {
                            try {
                              downloadInvoicePDF(inv);
                            } catch (e) {
                              console.error(e);
                            }
                          }}
                          className="text-primary hover:underline text-sm font-semibold"
                        >
                          PDF
                        </button>
                        <button
                          onClick={() => {
                            downloadCSV([inv]);
                          }}
                          className="text-primary hover:underline text-sm font-semibold"
                        >
                          Export CSV
                        </button>
                        <button
                          onClick={() => handleDeleteInvoice(inv.invoiceNumber)}
                          className="text-red-600 hover:text-red-900 text-sm font-semibold"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
