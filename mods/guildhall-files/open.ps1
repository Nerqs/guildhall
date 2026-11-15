# Guildhall: opens a file outside Herdr (run by guildhall-files and guildhall-changes).
#   -Mode edit    the default text editor: whatever Windows opens .txt files with (Notepad,
#                 Notepad++, VS Code...), for any file, whatever its extension.
#   -Mode open    the file's own default program (Photos, the PDF reader, a spreadsheet...).
#   -Mode reveal  Explorer, with the file selected.
# Paths may be WSL files seen from Windows (\\wsl.localhost\<distro>\...).
param(
  [Parameter(Mandatory)][ValidateSet("edit", "open", "reveal")][string]$Mode,
  [Parameter(Mandatory)][string]$Path
)
$ErrorActionPreference = "Stop"
if (-not (Test-Path -LiteralPath $Path)) { [Console]::Error.WriteLine("Not found: $Path"); exit 2 }

if ($Mode -eq "reveal") {
  Start-Process explorer.exe -ArgumentList "/select,`"$Path`""
  exit 0
}

# ShellExecuteEx with a class: "edit" asks for .txt's handler, so the person's chosen editor
# opens the file even when its extension belongs to another program (or to none).
Add-Type -Language CSharp @"
using System;
using System.Runtime.InteropServices;
public static class GuildhallShell {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct SHELLEXECUTEINFO {
    public int cbSize; public uint fMask; public IntPtr hwnd;
    public string lpVerb; public string lpFile; public string lpParameters; public string lpDirectory;
    public int nShow; public IntPtr hInstApp; public IntPtr lpIDList; public string lpClass;
    public IntPtr hkeyClass; public uint dwHotKey; public IntPtr hIcon; public IntPtr hProcess;
  }
  [DllImport("shell32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool ShellExecuteEx(ref SHELLEXECUTEINFO info);
  public static int Open(string file, string cls) {
    var info = new SHELLEXECUTEINFO();
    info.cbSize = Marshal.SizeOf(info);
    info.fMask = 0x00000400 | 0x00000100; // SEE_MASK_FLAG_NO_UI | SEE_MASK_INVOKEIDLIST
    if (cls != null) { info.fMask |= 0x00000001; info.lpClass = cls; } // SEE_MASK_CLASSNAME
    info.lpVerb = "open"; info.lpFile = file; info.nShow = 1;
    return ShellExecuteEx(ref info) ? 0 : Marshal.GetLastWin32Error();
  }
}
"@
$err = [GuildhallShell]::Open($Path, $(if ($Mode -eq "edit") { ".txt" } else { $null }))
if ($err -eq 1155) {
  # No program for this kind of file: Windows' "Open with" picker.
  Start-Process rundll32.exe -ArgumentList "shell32.dll,OpenAs_RunDLL $Path"
  exit 0
}
if ($err -ne 0) { [Console]::Error.WriteLine("Windows couldn't open it (error $err)"); exit 1 }
