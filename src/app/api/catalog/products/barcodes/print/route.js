import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import { execFile } from "child_process";
import { successResponse, errorResponse } from "@/lib/api-response";
import { requireAuth, requirePermission } from "@/lib/api-protection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

const RAW_PRINT_SCRIPT = String.raw`
param(
  [Parameter(Mandatory=$true)][string]$PrinterName,
  [Parameter(Mandatory=$true)][string]$FilePath
)

$source = @"
using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;

public class RawPrinterHelper
{
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public class DOCINFOA
  {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
  }

  [DllImport("winspool.Drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);

  [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool ClosePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

  [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);

  public static void SendFileToPrinter(string printerName, string fileName)
  {
    byte[] bytes = File.ReadAllBytes(fileName);
    IntPtr unmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
    Marshal.Copy(bytes, 0, unmanagedBytes, bytes.Length);

    IntPtr printerHandle;
    if (!OpenPrinter(printerName.Normalize(), out printerHandle, IntPtr.Zero))
      throw new Win32Exception(Marshal.GetLastWin32Error(), "Unable to open printer: " + printerName);

    DOCINFOA docInfo = new DOCINFOA();
    docInfo.pDocName = "TSC Barcode Labels";
    docInfo.pDataType = "RAW";

    try
    {
      if (!StartDocPrinter(printerHandle, 1, docInfo))
        throw new Win32Exception(Marshal.GetLastWin32Error(), "Unable to start raw print job");
      if (!StartPagePrinter(printerHandle))
        throw new Win32Exception(Marshal.GetLastWin32Error(), "Unable to start printer page");

      int written;
      if (!WritePrinter(printerHandle, unmanagedBytes, bytes.Length, out written) || written != bytes.Length)
        throw new Win32Exception(Marshal.GetLastWin32Error(), "Unable to write complete raw print job");

      EndPagePrinter(printerHandle);
      EndDocPrinter(printerHandle);
    }
    finally
    {
      ClosePrinter(printerHandle);
      Marshal.FreeCoTaskMem(unmanagedBytes);
    }
  }
}
"@

Add-Type -TypeDefinition $source -Language CSharp
[RawPrinterHelper]::SendFileToPrinter($PrinterName, $FilePath)
`;

function cleanTspl(value) {
  const tspl = String(value || "");
  if (!tspl.trim()) throw new Error("No barcode print data received");
  if (tspl.length > 1024 * 1024)
    throw new Error("Barcode print job is too large");
  return tspl.replace(/[^\x09\x0a\x0d\x20-\x7e]/g, "");
}

async function listPrinters() {
  const windowsPrinters = await listWindowsPrinters().catch(() => []);
  if (windowsPrinters.length) return windowsPrinters;
  return listCupsPrinters();
}

async function listWindowsPrinters() {
  const command =
    "Get-Printer | Select-Object Name,DriverName,PortName,Default,PrinterStatus,WorkOffline | ConvertTo-Json -Compress";
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
      { windowsHide: true, timeout: 15000 },
    );
    const parsed = JSON.parse(stdout || "[]");
    const printers = Array.isArray(parsed) ? parsed : [parsed];
    return printers.map((printer) => ({ ...printer, Backend: "windows" }));
  } catch {
    const fallbackCommand =
      "Get-CimInstance Win32_Printer | Select-Object Name,DriverName,PortName,Default,WorkOffline | ConvertTo-Json -Compress";
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", fallbackCommand],
      { windowsHide: true, timeout: 15000 },
    );
    const parsed = JSON.parse(stdout || "[]");
    const printers = Array.isArray(parsed) ? parsed : [parsed];
    return printers.map((printer) => ({ ...printer, Backend: "windows" }));
  }
}

async function listCupsPrinters() {
  try {
    const { stdout } = await execFileAsync("lpstat", ["-v"], {
      timeout: 15000,
    });
    return stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^device for ([^:]+):\s*(.*)$/i);
        return match
          ? {
              Name: match[1],
              DriverName: "CUPS raw",
              PortName: match[2],
              Backend: "cups",
            }
          : null;
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function selectTscPrinter(printers, requestedName) {
  const requested = String(requestedName || "")
    .trim()
    .toLowerCase();
  const normalize = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  if (requested) {
    const normalizedRequested = normalize(requested);
    return (
      printers.find((printer) => printer.Name?.toLowerCase() === requested) ||
      printers.find(
        (printer) => normalize(printer.Name) === normalizedRequested,
      ) ||
      printers.find((printer) => {
        const normalizedName = normalize(printer.Name);
        return (
          normalizedName.includes(normalizedRequested) ||
          normalizedRequested.includes(normalizedName)
        );
      })
    );
  }

  return (
    printers.find((printer) =>
      [printer.Name, printer.DriverName, printer.PortName]
        .filter(Boolean)
        .some((value) =>
          /tsc|ttp|244|seagull|bartender|barcode|label|rugtek/i.test(
            String(value),
          ),
        ),
    ) ||
    printers.find((printer) => printer.Default === true) ||
    printers[0]
  );
}

async function sendRawToPrinter({ printerName, tspl }) {
  if (printerName.Backend === "cups") {
    return sendRawToCupsPrinter({ printerName, tspl });
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "tsc-print-"));
  const printFile = path.join(tmpDir, "barcodes.prn");
  const scriptFile = path.join(tmpDir, "raw-print.ps1");

  try {
    await fs.writeFile(printFile, tspl, "ascii");
    await fs.writeFile(scriptFile, RAW_PRINT_SCRIPT, "utf8");
    await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptFile,
        "-PrinterName",
        printerName.Name,
        "-FilePath",
        printFile,
      ],
      { windowsHide: true, timeout: 30000 },
    );
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function sendRawToCupsPrinter({ printerName, tspl }) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "tsc-print-"));
  const printFile = path.join(tmpDir, "barcodes.prn");

  try {
    await fs.writeFile(printFile, tspl, "ascii");
    await execFileAsync(
      "lp",
      ["-d", printerName.Name, "-o", "raw", printFile],
      {
        timeout: 30000,
      },
    );
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const permissionCheck = requirePermission(
      auth.user,
      "VIEW_CATALOG",
      "MANAGE_CATALOG",
    );
    if (permissionCheck.error) return permissionCheck.error;

    const body = await request.json().catch(() => ({}));
    const tspl = cleanTspl(body.tspl);
    const printers = await listPrinters();
    const printer = selectTscPrinter(printers, body.printerName);

    if (!printer?.Name) {
      const names = printers
        .map((item) => item.Name)
        .filter(Boolean)
        .join(", ");
      const platformHint =
        process.platform === "win32"
          ? "Enter the exact Windows printer name shown in Printers & scanners, or leave Printer Name blank to use auto/default printer."
          : "Install the TSC printer queue first.";
      return errorResponse(
        `Barcode printer queue was not found. ${platformHint} Installed printers: ${names || "none"}`,
        400,
      );
    }

    await sendRawToPrinter({ printerName: printer, tspl });
    return successResponse(
      { printerName: printer.Name },
      `Sent barcode labels to ${printer.Name}`,
    );
  } catch (err) {
    return errorResponse(
      err.message || "Unable to print barcode labels",
      500,
      err,
    );
  }
}
