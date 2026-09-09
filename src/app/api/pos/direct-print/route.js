import { randomUUID } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import os from 'os';
import path from 'path';
import { successResponse, errorResponse } from '@/lib/api-response';
import { requireAuth, requirePermission } from '@/lib/api-protection';

export const runtime = 'nodejs';

const execFileAsync = promisify(execFile);
const WINDOWS_ROOTS = Array.from(
  new Set(
    [
      process.env.SystemRoot,
      process.env.SYSTEMROOT,
      process.env.WINDIR,
      process.env.windir,
      'C:\\Windows',
      'C:\\WINDOWS',
    ].filter(Boolean),
  ),
);
const POWERSHELL_CANDIDATES = Array.from(
  new Set(
    WINDOWS_ROOTS.flatMap((root) => [
      path.win32.join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      path.win32.join(root, 'Sysnative', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      path.win32.join(root, 'SysWOW64', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    ]).concat(['powershell.exe']),
  ),
);
const CMD_CANDIDATES = Array.from(
  new Set(
    WINDOWS_ROOTS.map((root) => path.win32.join(root, 'System32', 'cmd.exe')).concat(['cmd.exe']),
  ),
);

function cleanPrinterName(value) {
  return String(value || '').trim().slice(0, 120);
}

function cleanReceiptText(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '')
    .trim();
}

function cleanCutFeedLines(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(5, Math.max(0, Math.round(parsed)));
}

async function runPowerShell(args, options) {
  let lastError = null;
  for (const command of POWERSHELL_CANDIDATES) {
    if (path.win32.isAbsolute(command) && !existsSync(command)) continue;
    try {
      return await execFileAsync(command, args, options);
    } catch (error) {
      lastError = error;
      if (error.code && error.code !== 'ENOENT') throw error;
    }
  }

  const fallbackPowerShell =
    POWERSHELL_CANDIDATES.find((candidate) => path.win32.isAbsolute(candidate) && existsSync(candidate)) ||
    'powershell.exe';
  const commandLine = [fallbackPowerShell, ...args]
    .map((part) => `"${String(part).replace(/"/g, '\\"')}"`)
    .join(' ');
  for (const command of CMD_CANDIDATES) {
    if (path.win32.isAbsolute(command) && !existsSync(command)) continue;
    try {
      return await execFileAsync(command, ['/d', '/s', '/c', commandLine], options);
    } catch (error) {
      lastError = error;
      if (error.code && error.code !== 'ENOENT') throw error;
    }
  }

  throw new Error(
    `PowerShell launcher not found. Tried: ${POWERSHELL_CANDIDATES.join(', ')}`,
  );
}

export async function POST(request) {
  let tempPath = '';
  let scriptPath = '';
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'CREATE_POS_BILL', 'MANAGE_BILLING');
    if (permissionCheck.error) return permissionCheck.error;

    const body = await request.json();
    const printerName = cleanPrinterName(body.printerName);
    const receiptText = cleanReceiptText(body.receiptText);
    const cutFeedLines = cleanCutFeedLines(body.cutFeedLines);

    if (!printerName) return errorResponse('Printer name is required', 400);
    if (!receiptText) return errorResponse('Receipt text is empty', 400);

    tempPath = path.join(os.tmpdir(), `buyzaar-receipt-${randomUUID()}.txt`);
    await writeFile(tempPath, Buffer.from(`${receiptText}${'\n'.repeat(cutFeedLines)}\x1D\x56\x00`, 'ascii'));
    scriptPath = path.join(os.tmpdir(), `buyzaar-direct-print-${randomUUID()}.ps1`);

    const script = [
      'param([string]$Path, [string]$PrinterName)',
      '$ErrorActionPreference = "Stop";',
      '$printers = @();',
      'try { $printers = Get-Printer | Select-Object -ExpandProperty Name } catch {}',
      '$selected = $printers | Where-Object { $_ -ieq $PrinterName } | Select-Object -First 1;',
      'if (-not $selected) { $selected = $printers | Where-Object { $_ -like "*$PrinterName*" -or $PrinterName -like "*$_*" } | Select-Object -First 1; }',
      'if (-not $printers -or $printers.Count -eq 0) { $selected = $PrinterName }',
      'if (-not $selected) { throw "Printer not found: $PrinterName. Available printers: $($printers -join \', \')" }',
      '$rawType = @"',
      'using System;',
      'using System.Runtime.InteropServices;',
      'public class RawPrinterHelper {',
      '  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]',
      '  public class DOCINFOA {',
      '    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;',
      '    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;',
      '    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;',
      '  }',
      '  [DllImport("winspool.Drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]',
      '  public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);',
      '  [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]',
      '  public static extern bool ClosePrinter(IntPtr hPrinter);',
      '  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]',
      '  public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In] DOCINFOA di);',
      '  [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]',
      '  public static extern bool EndDocPrinter(IntPtr hPrinter);',
      '  [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]',
      '  public static extern bool StartPagePrinter(IntPtr hPrinter);',
      '  [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]',
      '  public static extern bool EndPagePrinter(IntPtr hPrinter);',
      '  [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]',
      '  public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);',
      '  public static bool SendBytesToPrinter(string printerName, byte[] bytes) {',
      '    IntPtr hPrinter;',
      '    DOCINFOA di = new DOCINFOA();',
      '    di.pDocName = "Buyzaar Receipt";',
      '    di.pDataType = "RAW";',
      '    if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) return false;',
      '    try {',
      '      if (!StartDocPrinter(hPrinter, 1, di)) return false;',
      '      try {',
      '        if (!StartPagePrinter(hPrinter)) return false;',
      '        try {',
      '          int written;',
      '          return WritePrinter(hPrinter, bytes, bytes.Length, out written) && written == bytes.Length;',
      '        } finally { EndPagePrinter(hPrinter); }',
      '      } finally { EndDocPrinter(hPrinter); }',
      '    } finally { ClosePrinter(hPrinter); }',
      '  }',
      '}',
      '"@',
      'try {',
      '  Add-Type -TypeDefinition $rawType;',
      '  $bytes = [System.IO.File]::ReadAllBytes($Path);',
      '  $sent = [RawPrinterHelper]::SendBytesToPrinter($selected, $bytes);',
      '  if (-not $sent) { throw "RAW printer write failed" }',
      '} catch {',
      '  Get-Content -LiteralPath $Path -Raw | Out-Printer -Name $selected',
      '}',
    ].join('\n');
    await writeFile(scriptPath, script, 'utf8');

    await runPowerShell(
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, tempPath, printerName],
      { windowsHide: true, timeout: 20000 },
    );

    return successResponse({ printerName }, 'Receipt sent to printer');
  } catch (error) {
    return errorResponse(error.message || 'Failed to print receipt', 500);
  } finally {
    if (tempPath) {
      await unlink(tempPath).catch(() => {});
    }
    if (scriptPath) {
      await unlink(scriptPath).catch(() => {});
    }
  }
}
