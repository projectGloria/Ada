; =====================================================================
; Inno Setup Script for Flutter Desktop Application: Ada
; =====================================================================

#define MyAppName "Ada"
#define MyAppVersion "1.1.8"
#define MyAppPublisher "Ada"
#define MyAppURL "https://github.com"
#define MyAppExeName "ada.exe"

; Relative path to the release build directory
#define MyAppSourceDir "build\windows\x64\runner\Release"

; Path to application icon
#define MyAppIcon "windows\runner\resources\app_icon.ico"

; Set to 1 to bundle and check for the Visual C++ Redistributable (x64)
#define IncludeVCRedist 1

[Setup]
; Unique application GUID
AppId={{E6F7A189-32F2-491A-8516-72F2625D9B4A}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}

; Destination directory: C:\Program Files\Ada
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes

; Output Configuration
OutputDir=installer_output
OutputBaseFilename=Ada-Setup
SetupIconFile={#MyAppIcon}
UninstallDisplayIcon={app}\{#MyAppExeName}

; 64-bit enforcement
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

; Compression & Modern UI
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern

; Privileges: Admin required for Program Files and VC++ redist installation
PrivilegesRequired=admin

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; 1. Copy the main executable
Source: "{#MyAppSourceDir}\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion

; 2. Copy all DLLs and runtime dependencies in Release root
Source: "{#MyAppSourceDir}\*.dll"; DestDir: "{app}"; Flags: ignoreversion

; 3. Recursively copy all files and subdirectories in data\
Source: "{#MyAppSourceDir}\data\*"; DestDir: "{app}\data"; Flags: ignoreversion recursesubdirs createallsubdirs

; 4. Recursively copy any additional runtime files/directories (excluding binaries already copied)
Source: "{#MyAppSourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "{#MyAppExeName},*.dll,*.lib,data\*"

#if IncludeVCRedist
; Bundled Visual C++ Redistributable (installs only if needed)
Source: "vc_redist.x64.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall; Check: VCRedistNeedsInstall
#endif

[Icons]
; Start Menu shortcut
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\{#MyAppExeName}"
; Start Menu Uninstaller shortcut
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
; Optional Desktop shortcut
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
#if IncludeVCRedist
; Run VC++ Redistributable silently if not already installed
Filename: "{tmp}\vc_redist.x64.exe"; Parameters: "/install /passive /norestart"; Flags: waituntilterminated; StatusMsg: "Installing Microsoft Visual C++ 2015-2022 Redistributable (x64)..."; Check: VCRedistNeedsInstall
#endif

; Offer to run application on finish
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[Code]
// Checks registry to determine if VC++ 2015-2022 Redistributable (x64) is already installed
function VCRedistNeedsInstall: Boolean;
var
  Installed: Cardinal;
begin
  // Check standard x64 registry location for Visual C++ 14.x runtimes
  if RegQueryDWordValue(HKLM64, 'SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64', 'Installed', Installed) then
  begin
    Result := (Installed = 0);
  end
  else
  begin
    // If the key does not exist, the redistributable needs to be installed
    Result := True;
  end;
end;
