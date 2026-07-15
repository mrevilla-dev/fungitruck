/**
 * 🖨️ FungiTrack - Servidor Local de Impresión Zebra
 * 
 * Ejecutar con:  node print-server.js
 * 
 * Este proceso actúa como puente entre la web (local o productiva)
 * y la impresora Zebra ZD220 conectada por USB.
 * 
 * Puerto: 5174  (diferente al dev server para no conflictuar)
 */

import http from 'http';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 5174;
const PRINTER_NAME = 'ZDesigner ZD220-203dpi ZPL';

const PS_CODE_CLASS = `
using System;
using System.Runtime.InteropServices;
public class RawPrinterHelper {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }
    [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);
    [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool ClosePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);
    [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);
    public static bool SendBytesToPrinter(string szPrinterName, IntPtr pBytes, Int32 dwCount) {
        Int32 dwWritten = 0;
        IntPtr hPrinter = new IntPtr(0);
        DOCINFOA di = new DOCINFOA();
        bool bSuccess = false;
        di.pDocName = "ZPL Print Document";
        di.pDataType = "RAW";
        if (OpenPrinter(szPrinterName.Normalize(), out hPrinter, IntPtr.Zero)) {
            if (StartDocPrinter(hPrinter, 1, di)) {
                if (StartPagePrinter(hPrinter)) {
                    bSuccess = WritePrinter(hPrinter, pBytes, dwCount, out dwWritten);
                    EndPagePrinter(hPrinter);
                }
                EndDocPrinter(hPrinter);
            }
            ClosePrinter(hPrinter);
        }
        return bSuccess;
    }
}
`;

function sendToPrinterViaPS(zplContent) {
  return new Promise((resolve, reject) => {
    const tempZpl = path.join(__dirname, 'temp_print.zpl');
    const tempPs1 = path.join(__dirname, 'print.ps1');

    fs.writeFileSync(tempZpl, zplContent, 'utf8');

    const script = `
$code = @"
${PS_CODE_CLASS}
"@
Add-Type -TypeDefinition $code -Language CSharp
$printerName = "${PRINTER_NAME}"
$zplString = [System.IO.File]::ReadAllText("${tempZpl.replace(/\\/g, '\\\\')}")
$bytes = [System.Text.Encoding]::UTF8.GetBytes($zplString)
$ptr = [System.Runtime.InteropServices.Marshal]::AllocHGlobal($bytes.Length)
[System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $ptr, $bytes.Length)
$res = [RawPrinterHelper]::SendBytesToPrinter($printerName, $ptr, $bytes.Length)
[System.Runtime.InteropServices.Marshal]::FreeHGlobal($ptr)
if (!$res) { exit 1 }
`;

    fs.writeFileSync(tempPs1, script, 'utf8');
    exec('powershell -ExecutionPolicy Bypass -File print.ps1', { cwd: __dirname }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

const server = http.createServer((req, res) => {
  // Habilitar CORS + Private Network Access (Chrome requiere esto para HTTPS→localhost)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === '/print' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        await sendToPrinterViaPS(body);
        console.log(`[${new Date().toLocaleTimeString()}] ✅ Etiqueta enviada a ${PRINTER_NAME}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        console.error(`[${new Date().toLocaleTimeString()}] ❌ Error al imprimir:`, err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  } else if (req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, printer: PRINTER_NAME }));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log('');
  console.log('  🖨️  FungiTrack Print Server');
  console.log('  ────────────────────────────────');
  console.log(`  Puerto:    http://localhost:${PORT}`);
  console.log(`  Impresora: ${PRINTER_NAME}`);
  console.log('');
  console.log('  ✅ Listo. Esperando trabajos de impresión...');
  console.log('  (Dejá esta ventana abierta mientras uses FungiTrack)');
  console.log('');
});
