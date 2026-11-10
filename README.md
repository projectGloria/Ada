<p align="center">
  <img src="Ada.png" alt="Ada App Icon" width="128" height="128" />
</p>

<h1 align="center">Ada</h1>

<p align="center">
  <strong>The Offline-First Pomodoro & Focus Assistant</strong><br>
  Distraction-free tasks, Pomodoro timer, ambient focus soundscapes, and local Obsidian sync.
</p>

<p align="center">
  <sub>Windows • macOS • Linux • Web • Android • iOS</sub>
</p>

---

## ✨ Features

* 🔒 **100% Offline-First & Privacy-Focused**: No login, no registration, no accounts required. All tasks and timer data are stored locally in an embedded SQLite/Drift database on your device.
* 🍅 **Pomodoro Timer & Intervals**: Customizable focus and break intervals, interval presets, rhythm tracking, and compact mini-player mode.
* 🎧 **Built-in Ambient Focus Soundscapes**: Seamlessly looping 16-bit stereo ambient audio tracks that automatically start when you focus and pause on breaks:
  - 🌧️ Gentle Rain
  - 🌊 Flowing Stream
  - 🔥 Campfire
  - 🕰️ Mechanical Clockwork
  - 🌫️ Soothing White Noise
* 📝 **Obsidian Vault Sync**:
  - Export tasks directly into an Obsidian-compatible markdown format (`Ada Tasks.md`) with Obsidian tags (`#tag`), due dates (`📅 YYYY-MM-DD`), and Pomodoro estimates (`⏳ 2x25m`).
  - Automatic **Daily Notes** generation (`Daily Notes/YYYY-MM-DD.md`).
  - Two-way markdown checklist importer (`- [ ] task name`).
* 🪟 **Native Windows Enhancements**:
  - Taskbar live progress indicator showing real-time focus elapsed time.
  - Floating mini-timer player and companion window.
  - Custom Ada desktop icon branding.
* 💎 **Full Lifetime Access**: All features, advanced filters, voice-to-task notes, and custom themes unlocked out of the box with zero paywalls.

---

## 🚀 Getting Started

### Prerequisites

* [Flutter SDK](https://flutter.dev/) (Channel `stable`, 3.24+ recommended)
* For Windows Desktop builds:
  * Visual Studio Build Tools 2022 with **Desktop development with C++** (including MSVC, CMake, and C++ ATL)
  * Windows Developer Mode enabled (for symlink support)

### Setup & Run

1. **Install dependencies:**
   ```bash
   flutter pub get
   ```

2. **Run in development mode:**
   ```bash
   # Windows Desktop
   flutter run -d windows

   # Or other platforms
   flutter run -d macos
   flutter run -d linux
   flutter run -d chrome
   ```

3. **Build a Standalone Release:**
   ```bash
   flutter build windows
   ```
   The compiled standalone binary will be generated at:
   `build/windows/x64/runner/Release/Ada.exe`

---

## 📂 Project Structure

```
ada/
├── lib/                     # Flutter / Dart application source code
│   ├── config/              # App bootstrap and dependency providers
│   ├── data/                # Repositories, SQLite/Drift database, audio services
│   ├── domain/              # Task, focus, and settings models
│   ├── routing/             # GoRouter navigation & deep-link handling
│   └── ui/                  # Adaptive screens, focus timer, themes, and settings
├── assets/                  # Branding icons, shaders, and ambient soundscapes
├── windows/                 # Windows native runner and CMake configuration
├── android/                 # Android native runner
├── ios/                     # iOS native runner
├── macos/                   # macOS native runner
├── linux/                   # Linux native runner
├── web/                     # Web runner and worker scripts
├── pubspec.yaml             # Flutter project manifest & dependencies
└── LICENSE                  # MIT License
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
